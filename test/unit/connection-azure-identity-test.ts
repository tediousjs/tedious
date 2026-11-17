import { transformAsync } from '@babel/core';
import { assert } from 'chai';
import { execFile } from 'child_process';
import * as http from 'http';
import * as net from 'net';
import { resolve } from 'path';
import { promisify } from 'util';

import Connection, { type ConnectionConfiguration } from '../../src/connection';
import Debug from '../../src/debug';
import MessageIO from '../../src/message-io';
import { TYPE } from '../../src/packet';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';

const execFileAsync = promisify(execFile);

const projectRoot = resolve(__dirname, '../..');

/** Matches files of the Azure SDK packages that tedious must load only on demand. */
const onDemandAzurePackages = /[\\/]@azure[\\/](identity|keyvault-keys)[\\/]/;

/** A PRELOGIN response with a VERSION option and ENCRYPTION set to ENCRYPT_NOT_SUP. */
function preloginResponse(): Buffer {
  return Buffer.from([
    0x00, 0x00, 0x0B, 0x00, 0x06, // VERSION: offset 11, length 6
    0x01, 0x00, 0x11, 0x00, 0x01, // ENCRYPTION: offset 17, length 1
    0xFF, // TERMINATOR
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, // VERSION
    0x02 // ENCRYPT_NOT_SUP
  ]);
}

/** A login response that contains only a FEDAUTHINFO token, which asks the client for an Entra ID token. */
function fedAuthInfoResponse(): Buffer {
  const spn = Buffer.from('https://database.windows.net/', 'ucs2');
  const stsUrl = Buffer.from('https://login.microsoftonline.com/common', 'ucs2');
  const optionsLength = 4 + 9 + 9;

  const buffer = new WritableTrackingBuffer();
  buffer.writeUInt8(0xEE); // FEDAUTHINFO
  buffer.writeUInt32LE(optionsLength + spn.length + stsUrl.length);
  buffer.writeUInt32LE(2); // Number of options
  buffer.writeUInt8(0x02); // SPN
  buffer.writeUInt32LE(spn.length);
  buffer.writeUInt32LE(optionsLength);
  buffer.writeUInt8(0x01); // STSURL
  buffer.writeUInt32LE(stsUrl.length);
  buffer.writeUInt32LE(optionsLength + spn.length);
  buffer.writeBuffer(spn);
  buffer.writeBuffer(stsUrl);
  return buffer.data;
}

async function readMessage(io: MessageIO, type: number): Promise<Buffer> {
  const message = await io.readMessage();
  assert.strictEqual(message.type, type);
  const chunks: Buffer[] = [];
  for await (const chunk of message) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

describe('Connection loading of `@azure/identity`', function() {
  it('does not load `@azure/identity` or `@azure/keyvault-keys` when tedious is required', async function() {
    this.timeout(30000);

    // Use a new process, so that modules that other tests loaded do not count.
    // Where possible, also disable `require()` of ES modules, as AWS Lambda does.
    const flags = process.allowedNodeEnvironmentFlags.has('--no-experimental-require-module') ?
      ['--no-experimental-require-module'] :
      [];
    const script = [
      "require('@babel/register')({ extensions: ['.js', '.ts'] });",
      "require('./src/tedious');",
      'process.stdout.write(JSON.stringify(Object.keys(require.cache)));'
    ].join('\n');

    const { stdout } = await execFileAsync(process.execPath, [...flags, '-e', script], { cwd: projectRoot });
    const loaded: string[] = JSON.parse(stdout);

    assert.include(loaded, resolve(projectRoot, 'src/connection.ts'), 'the child process should load the connection module');
    assert.deepEqual(loaded.filter((file) => onDemandAzurePackages.test(file)), [], 'there should be no Azure SDK modules loaded with tedious');
  });

  it('keeps `import()` in the build output', async function() {
    // A `require()` would load the CommonJS build of `@azure/identity`, which
    // fails where `require()` of ES modules is disabled.
    const result = await transformAsync("export const load = () => import('@azure/identity');", {
      cwd: projectRoot,
      filename: resolve(projectRoot, 'src/example.ts')
    });

    assert.include(result?.code, "import('@azure/identity')", 'the build should keep `import()` as a native dynamic import');
  });

  describe('when the server asks for an Entra ID token', function() {
    let server: net.Server;
    let connection: Connection | undefined;

    beforeEach(function(done) {
      server = net.createServer();
      server.listen(0, '127.0.0.1', done);
    });

    afterEach(function(done) {
      connection?.close();
      server.close(done);
    });

    /**
     * Connects with `authentication`, and answers LOGIN7 with a request for an
     * Entra ID token. Returns the server side of the connection and the result
     * of the connection attempt.
     */
    async function connectAndAskForToken(authentication: Authentication) {
      const { address, port } = server.address() as net.AddressInfo;
      connection = new Connection({
        server: address,
        authentication,
        options: { port, encrypt: false, connectTimeout: 5000 }
      });

      const accepted = new Promise<net.Socket>((resolve) => { server.once('connection', resolve); });
      const result = new Promise<Error | undefined>((resolve) => { connection!.connect(resolve); });

      const socket = await accepted;
      const io = new MessageIO(socket, 4096, new Debug());
      await readMessage(io, TYPE.PRELOGIN);
      io.sendMessage(TYPE.RESPONSE, preloginResponse());
      await readMessage(io, TYPE.LOGIN7);
      io.sendMessage(TYPE.RESPONSE, fedAuthInfoResponse());

      return { socket, io, result };
    }

    // These credentials reject the tenant id when they are created. This
    // shows that the credential came from `@azure/identity`, without a call
    // to Entra ID.
    for (const type of ['azure-active-directory-password', 'azure-active-directory-service-principal-secret'] as const) {
      it(`loads \`@azure/identity\` to create the credential for \`${type}\``, async function() {
        const { result } = await connectAndAskForToken({
          type,
          options: {
            tenantId: 'not a valid tenant id',
            clientId: 'client-id',
            clientSecret: 'client-secret',
            userName: 'user-name',
            password: 'password'
          }
        });

        const error = await result;
        assert.instanceOf(error, Error);
        assert.match(error!.message, /Invalid tenant id provided/, 'the `@azure/identity` credential should reject the tenant id');
      });
    }

    describe('with a managed identity', function() {
      const token = 'managed-identity-token';

      let identityServer: http.Server;
      let requestedClientIds: Array<string | null>;
      let savedEnvironment: Record<string, string | undefined>;

      // MSAL selects the managed identity endpoint only once in a process, so
      // all the tests in this block must use the same endpoint.
      before(async function() {
        identityServer = http.createServer((request, response) => {
          requestedClientIds.push(new URL(request.url!, 'http://localhost').searchParams.get('client_id'));
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({
            access_token: token,
            expires_on: String(Math.floor(Date.now() / 1000) + 3600),
            resource: 'https://database.windows.net/',
            token_type: 'Bearer'
          }));
        });
        await new Promise<void>((resolve) => { identityServer.listen(0, '127.0.0.1', resolve); });

        const { port } = identityServer.address() as net.AddressInfo;
        savedEnvironment = setEnvironment({
          // The App Service managed identity endpoint.
          IDENTITY_ENDPOINT: `http://127.0.0.1:${port}/token`,
          IDENTITY_HEADER: 'identity-header',
          // Make `DefaultAzureCredential` use only its managed identity credential.
          AZURE_TOKEN_CREDENTIALS: 'ManagedIdentityCredential',
          // Remove the settings that select a different identity or endpoint.
          AZURE_CLIENT_ID: undefined,
          AZURE_FEDERATED_TOKEN_FILE: undefined,
          IDENTITY_SERVER_THUMBPRINT: undefined
        });
      });

      after(async function() {
        setEnvironment(savedEnvironment);
        await new Promise<void>((resolve, reject) => {
          identityServer.close((err) => { err ? reject(err) : resolve(); });
        });
      });

      beforeEach(function() {
        requestedClientIds = [];
      });

      /** Reads the FEDAUTH_TOKEN message, and returns the token in it. */
      async function readToken(io: MessageIO): Promise<string> {
        const data = await readMessage(io, TYPE.FEDAUTH_TOKEN);
        return data.toString('ucs2', 8, 8 + data.readUInt32LE(4));
      }

      // MSAL keeps tokens for the rest of the process. Each client id occurs
      // only once here, so that its test always sends a token request.
      const cases: Array<{ type: 'azure-active-directory-msi-vm' | 'azure-active-directory-msi-app-service' | 'azure-active-directory-default', clientId?: string }> = [
        { type: 'azure-active-directory-msi-vm', clientId: 'msi-vm-client-id' },
        { type: 'azure-active-directory-msi-app-service' },
        { type: 'azure-active-directory-default', clientId: 'default-client-id' },
        { type: 'azure-active-directory-default' }
      ];

      for (const { type, clientId } of cases) {
        it(`sends the managed identity token for \`${type}\` ${clientId ? 'with' : 'without'} a client id`, async function() {
          const { socket, io, result } = await connectAndAskForToken({ type, options: { clientId } });

          assert.strictEqual(await readToken(io), token, 'the client should send the token from the managed identity endpoint');
          if (clientId) {
            assert.include(requestedClientIds, clientId, 'the token request should be for the configured client id');
          }

          socket.destroy();
          await result;
        });
      }
    });
  });
});

type Authentication = NonNullable<ConnectionConfiguration['authentication']>;

/**
 * Sets the environment variables in `values`, and removes those that are
 * `undefined`. Returns the earlier values, which this function can restore.
 */
function setEnvironment(values: Record<string, string | undefined>): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(values)) {
    saved[name] = process.env[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  return saved;
}
