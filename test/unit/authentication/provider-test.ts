import { assert } from 'chai';
import * as net from 'net';
import sinon from 'sinon';

import { Connection, ConnectionError } from '../../../src/tedious';
import { type AuthenticationContext, type AuthenticationProvider, type AuthenticationSession } from '../../../src/authentication/provider';
import IncomingMessageStream from '../../../src/incoming-message-stream';
import OutgoingMessageStream from '../../../src/outgoing-message-stream';
import Debug from '../../../src/debug';
import PreloginPayload from '../../../src/prelogin-payload';
import Message from '../../../src/message';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';

const TYPE = {
  SQL_BATCH: 0x01,
  TABULAR_RESULT: 0x04,
  FEDAUTH_TOKEN: 0x08,
  LOGIN7: 0x10,
  SSPI: 0x11,
  PRELOGIN: 0x12
};

function buildLoginAckToken(): Buffer {
  const progname = 'Tedious SQL Server';

  const buffer = Buffer.from([
    0xAD, // Type
    0x00, 0x00, // Length
    0x00, // interface number - SQL
    0x74, 0x00, 0x00, 0x04, // TDS version number
    Buffer.byteLength(progname, 'ucs2') / 2, ...Buffer.from(progname, 'ucs2'), // Progname
    0x00, // major
    0x00, // minor
    0x00, 0x00, // buildNum
  ]);

  buffer.writeUInt16LE(buffer.length - 3, 1);

  return buffer;
}

function buildSspiToken(data: Buffer): Buffer {
  const buffer = new WritableTrackingBuffer();
  buffer.writeUInt8(0xED);
  buffer.writeUsVarbyte(data);
  return buffer.data;
}

function buildFedAuthInfoToken(stsUrl: string, spn: string): Buffer {
  const stsUrlData = Buffer.from(stsUrl, 'ucs2');
  const spnData = Buffer.from(spn, 'ucs2');

  const optionsLength = 4 + 2 * 9;
  const data = Buffer.alloc(optionsLength + stsUrlData.length + spnData.length);
  let offset = data.writeUInt32LE(2, 0);

  offset = data.writeUInt8(0x01, offset); // STSURL
  offset = data.writeUInt32LE(stsUrlData.length, offset);
  offset = data.writeUInt32LE(optionsLength, offset);

  offset = data.writeUInt8(0x02, offset); // SPN
  offset = data.writeUInt32LE(spnData.length, offset);
  data.writeUInt32LE(optionsLength + stsUrlData.length, offset);

  stsUrlData.copy(data, optionsLength);
  spnData.copy(data, optionsLength + stsUrlData.length);

  const header = Buffer.alloc(5);
  header.writeUInt8(0xEE, 0);
  header.writeUInt32LE(data.length, 1);

  return Buffer.concat([header, data]);
}

function buildFedAuthFeatureExtAckToken(): Buffer {
  return Buffer.from([
    0xAE, // Type
    0x02, // FEDAUTH
    0x00, 0x00, 0x00, 0x00, // FeatureAckDataLen
    0xFF // Terminator
  ]);
}

interface ServerMessage {
  type: number;
  data: Buffer;
}

interface ScriptedConnection {
  read(): Promise<ServerMessage>;
  write(type: number, ...data: Buffer[]): void;
}

/**
 * Sends the PRELOGIN response for the given connection.
 */
async function handlePrelogin(connection: ScriptedConnection) {
  const message = await connection.read();
  assert.strictEqual(message.type, TYPE.PRELOGIN);

  const payload = new PreloginPayload({ encrypt: false, version: { major: 0, minor: 0, build: 0, subbuild: 0 } });
  connection.write(TYPE.PRELOGIN, payload.data);
}

/**
 * Responds to the initial SQL batch sent after a successful login.
 */
async function handleInitialSql(connection: ScriptedConnection) {
  const message = await connection.read();
  assert.strictEqual(message.type, TYPE.SQL_BATCH);

  connection.write(TYPE.TABULAR_RESULT);
}

describe('Authentication providers', function() {
  let server: net.Server;
  let serverErrors: unknown[];

  beforeEach(function(done) {
    serverErrors = [];
    server = net.createServer();
    server.on('error', done);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', done);
      done();
    });
  });

  afterEach(function(done) {
    server.close(done);
  });

  afterEach(function() {
    if (serverErrors.length) {
      throw serverErrors[0];
    }
  });

  function onConnection(script: (connection: ScriptedConnection) => Promise<void>) {
    server.on('connection', async (socket) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      socket.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(socket);

      const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

      const connection: ScriptedConnection = {
        async read() {
          const { value: message, done } = await messageIterator.next();
          if (done) {
            throw new Error('Connection was closed by the client');
          }

          const chunks: Buffer[] = [];
          for await (const data of message) {
            chunks.push(data);
          }

          return { type: message.type, data: Buffer.concat(chunks) };
        },

        write(type, ...data) {
          const message = new Message({ type: type });
          for (const buffer of data) {
            message.write(buffer);
          }
          message.end();
          outgoingMessageStream.write(message);
        }
      };

      try {
        await script(connection);

        // No further messages are expected, wait for the client to close the connection.
        const { done } = await messageIterator.next();
        assert.isTrue(done, 'Expected no further messages from the client');
      } catch (err) {
        serverErrors.push(err);
      } finally {
        socket.end();
      }
    });
  }

  function createConnection(authentication: AuthenticationProvider | { type: string, options: any }) {
    return new Connection({
      server: (server.address() as net.AddressInfo).address,
      authentication: authentication as any,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false
      }
    });
  }

  async function connect(connection: Connection) {
    try {
      await new Promise<void>((resolve, reject) => {
        connection.connect((err) => {
          err ? reject(err) : resolve();
        });
      });
    } finally {
      connection.close();
    }
  }

  it('accepts an authentication provider as `config.authentication`', function() {
    const provider: AuthenticationProvider = {
      createSession() {
        return { type: 'sql', userName: 'user', password: 'password' };
      }
    };

    const connection = createConnection(provider);
    assert.strictEqual(connection.config.authentication, provider);
    assert.strictEqual(connection.authenticationProvider, provider);
  });

  describe('with a `sql` session', function() {
    it('logs in with the user name and password returned by the session', async function() {
      onConnection(async (connection) => {
        await handlePrelogin(connection);

        const login = await connection.read();
        assert.strictEqual(login.type, TYPE.LOGIN7);
        assert.isTrue(login.data.includes(Buffer.from('rotating-user', 'ucs2')));

        connection.write(TYPE.TABULAR_RESULT, buildLoginAckToken());

        await handleInitialSql(connection);
      });

      const contexts: AuthenticationContext[] = [];
      const close = sinon.spy();

      await connect(createConnection({
        createSession(context) {
          contexts.push(context);
          return { type: 'sql', userName: 'rotating-user', password: 'rotating-password', close: close };
        }
      }));

      assert.lengthOf(contexts, 1);
      assert.strictEqual(contexts[0].server, (server.address() as net.AddressInfo).address);
      assert.strictEqual(contexts[0].port, (server.address() as net.AddressInfo).port);
      assert.isUndefined(contexts[0].instanceName);
      // The PRELOGIN response sent by the test server sets FEDAUTHREQUIRED
      assert.isTrue(contexts[0].fedAuthRequired);
      assert.instanceOf(contexts[0].signal, AbortSignal);

      sinon.assert.calledOnce(close);
    });
  });

  describe('with an `sspi` session', function() {
    it('exchanges security tokens with the server until the login is acknowledged', async function() {
      const initialToken = Buffer.from('initial-token');
      const challenges = [Buffer.from('first-challenge'), Buffer.from('second-challenge')];
      const responses = [Buffer.from('first-response'), Buffer.from('second-response')];

      onConnection(async (connection) => {
        await handlePrelogin(connection);

        const login = await connection.read();
        assert.strictEqual(login.type, TYPE.LOGIN7);
        assert.isTrue(login.data.includes(initialToken));

        for (let i = 0; i < challenges.length; i++) {
          connection.write(TYPE.TABULAR_RESULT, buildSspiToken(challenges[i]));

          const response = await connection.read();
          assert.strictEqual(response.type, TYPE.SSPI);
          assert.deepEqual(response.data, responses[i]);
        }

        connection.write(TYPE.TABULAR_RESULT, buildLoginAckToken());

        await handleInitialSql(connection);
      });

      const handleChallenge = sinon.stub();
      handleChallenge.onFirstCall().resolves(responses[0]);
      handleChallenge.onSecondCall().returns(responses[1]);
      const close = sinon.spy();

      await connect(createConnection({
        async createSession() {
          return { type: 'sspi', initialToken: initialToken, handleChallenge: handleChallenge, close: close };
        }
      }));

      sinon.assert.calledTwice(handleChallenge);
      assert.deepEqual(handleChallenge.firstCall.args[0], challenges[0]);
      assert.instanceOf(handleChallenge.firstCall.args[1], AbortSignal);
      assert.deepEqual(handleChallenge.secondCall.args[0], challenges[1]);

      sinon.assert.calledOnce(close);
    });

    it('fails the login if computing the response fails', async function() {
      const challengeError = new Error('InitializeSecurityContext failed');

      onConnection(async (connection) => {
        await handlePrelogin(connection);

        const login = await connection.read();
        assert.strictEqual(login.type, TYPE.LOGIN7);

        connection.write(TYPE.TABULAR_RESULT, buildSspiToken(Buffer.from('challenge')));
      });

      const close = sinon.spy();

      let error: any;
      try {
        await connect(createConnection({
          createSession() {
            return {
              type: 'sspi',
              initialToken: Buffer.from('initial-token'),
              handleChallenge() { throw challengeError; },
              close: close
            };
          }
        }));
      } catch (err) {
        error = err;
      }

      assert.instanceOf(error, ConnectionError);
      assert.strictEqual(error.code, 'ELOGIN');
      assert.strictEqual(error.message, 'SSPI authentication failed: InitializeSecurityContext failed');
      assert.strictEqual(error.cause, challengeError);

      sinon.assert.calledOnce(close);
    });
  });

  describe('with a `federated` session', function() {
    it('sends a `security-token` session token as part of the LOGIN7 message', async function() {
      onConnection(async (connection) => {
        await handlePrelogin(connection);

        const login = await connection.read();
        assert.strictEqual(login.type, TYPE.LOGIN7);
        assert.isTrue(login.data.includes(Buffer.from('access-token', 'ucs2')));

        connection.write(TYPE.TABULAR_RESULT, buildFedAuthFeatureExtAckToken(), buildLoginAckToken());

        await handleInitialSql(connection);
      });

      await connect(createConnection({
        createSession() {
          return { type: 'federated', library: 'security-token', token: 'access-token' };
        }
      }));
    });

    it('acquires an `msal` session token using the information sent by the server', async function() {
      onConnection(async (connection) => {
        await handlePrelogin(connection);

        const login = await connection.read();
        assert.strictEqual(login.type, TYPE.LOGIN7);
        // FEDAUTH feature extension: MSAL library, echo (FEDAUTHREQUIRED was set in PRELOGIN), integrated workflow
        assert.isTrue(login.data.includes(Buffer.from([0x02, 0x02, 0x00, 0x00, 0x00, 0x05, 0x02])));

        connection.write(TYPE.TABULAR_RESULT, buildFedAuthInfoToken('https://login.example.com/tenant', 'https://database.example.com/'));

        const tokenMessage = await connection.read();
        assert.strictEqual(tokenMessage.type, TYPE.FEDAUTH_TOKEN);
        assert.strictEqual(tokenMessage.data.toString('ucs2', 8), 'msal-token');

        connection.write(TYPE.TABULAR_RESULT, buildFedAuthFeatureExtAckToken(), buildLoginAckToken());

        await handleInitialSql(connection);
      });

      const getToken = sinon.stub().resolves('msal-token');

      await connect(createConnection({
        createSession() {
          return { type: 'federated', library: 'msal', workflow: 'integrated', getToken: getToken };
        }
      }));

      sinon.assert.calledOnce(getToken);
      assert.deepEqual(getToken.firstCall.args[0], { spn: 'https://database.example.com/', stsUrl: 'https://login.example.com/tenant' });
      assert.instanceOf(getToken.firstCall.args[1], AbortSignal);
    });

    it('fails the login with an `EFEDAUTH` error if acquiring the token fails', async function() {
      const tokenError = new Error('token service unavailable');

      onConnection(async (connection) => {
        await handlePrelogin(connection);

        const login = await connection.read();
        assert.strictEqual(login.type, TYPE.LOGIN7);

        connection.write(TYPE.TABULAR_RESULT, buildFedAuthInfoToken('https://login.example.com/tenant', 'https://database.example.com/'));
      });

      let error: any;
      try {
        await connect(createConnection({
          createSession() {
            return { type: 'federated', library: 'msal', workflow: 'password', getToken() { throw tokenError; } };
          }
        }));
      } catch (err) {
        error = err;
      }

      assert.instanceOf(error, AggregateError);
      assert.instanceOf(error.errors[0], ConnectionError);
      assert.strictEqual(error.errors[0].code, 'EFEDAUTH');
      assert.strictEqual(error.errors[1], tokenError);
    });
  });

  describe('when creating the session fails', function() {
    beforeEach(function() {
      onConnection(async (connection) => {
        await handlePrelogin(connection);
      });
    });

    it('fails the login with the error thrown by the provider', async function() {
      const providerError = new Error('could not reach the credential store');

      let error: any;
      try {
        await connect(createConnection({
          async createSession(): Promise<AuthenticationSession> {
            throw providerError;
          }
        }));
      } catch (err) {
        error = err;
      }

      assert.instanceOf(error, ConnectionError);
      assert.strictEqual(error.code, 'ELOGIN');
      assert.strictEqual(error.message, 'Failed to create the authentication session: could not reach the credential store');
      assert.strictEqual(error.cause, providerError);
    });

    it('fails the login if the provider returns an invalid session', async function() {
      let error: any;
      try {
        await connect(createConnection({
          createSession() {
            return { type: 'kerberos' } as any;
          }
        }));
      } catch (err) {
        error = err;
      }

      assert.instanceOf(error, ConnectionError);
      assert.strictEqual(error.code, 'ELOGIN');
      assert.instanceOf(error.cause, TypeError);
      assert.strictEqual(error.cause.message, 'The "type" property of the authentication session must be one of "sql", "sspi" or "federated".');
    });
  });

  describe('with a deprecated built-in authentication type', function() {
    it('emits a deprecation warning', function() {
      const emitWarning = sinon.spy(process, 'emitWarning');

      try {
        createConnection({ type: 'azure-active-directory-msi-vm', options: {} });
        createConnection({ type: 'azure-active-directory-msi-vm', options: {} });
      } finally {
        emitWarning.restore();
      }

      sinon.assert.calledOnce(emitWarning);
      assert.include(emitWarning.firstCall.args[0] as string, '`azure-active-directory-msi-vm` authentication type is deprecated');
      assert.deepEqual(emitWarning.firstCall.args[1], { type: 'DeprecationWarning', code: 'TEDIOUS_DEP_AUTHENTICATION_TYPE' });
    });

    it('logs in using `azure-active-directory-access-token`', async function() {
      onConnection(async (connection) => {
        await handlePrelogin(connection);

        const login = await connection.read();
        assert.strictEqual(login.type, TYPE.LOGIN7);
        assert.isTrue(login.data.includes(Buffer.from('legacy-access-token', 'ucs2')));

        connection.write(TYPE.TABULAR_RESULT, buildFedAuthFeatureExtAckToken(), buildLoginAckToken());

        await handleInitialSql(connection);
      });

      await connect(createConnection({ type: 'azure-active-directory-access-token', options: { token: 'legacy-access-token' } }));
    });

    it('logs in using `token-credential`', async function() {
      onConnection(async (connection) => {
        await handlePrelogin(connection);

        const login = await connection.read();
        assert.strictEqual(login.type, TYPE.LOGIN7);

        connection.write(TYPE.TABULAR_RESULT, buildFedAuthInfoToken('https://login.example.com/tenant', 'https://database.example.com/'));

        const tokenMessage = await connection.read();
        assert.strictEqual(tokenMessage.type, TYPE.FEDAUTH_TOKEN);
        assert.strictEqual(tokenMessage.data.toString('ucs2', 8), 'credential-token');

        connection.write(TYPE.TABULAR_RESULT, buildFedAuthFeatureExtAckToken(), buildLoginAckToken());

        await handleInitialSql(connection);
      });

      const getToken = sinon.stub().resolves({ token: 'credential-token', expiresOnTimestamp: Date.now() + 60000 });

      await connect(createConnection({ type: 'token-credential', options: { credential: { getToken } } }));

      sinon.assert.calledOnce(getToken);
      assert.strictEqual(getToken.firstCall.args[0], 'https://database.example.com/.default');
    });

    it('logs in using `ntlm`', async function() {
      onConnection(async (connection) => {
        await handlePrelogin(connection);

        const login = await connection.read();
        assert.strictEqual(login.type, TYPE.LOGIN7);
        // NTLM NEGOTIATE_MESSAGE
        assert.isTrue(login.data.includes(Buffer.from('NTLMSSP\u0000\u0001\u0000\u0000\u0000', 'ascii')));

        // NTLM CHALLENGE_MESSAGE
        const challenge = Buffer.alloc(56 + 4);
        challenge.write('NTLMSSP\u0000', 0, 'ascii');
        challenge.writeInt32LE(2, 8);
        Buffer.from([0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0xa7, 0xb8]).copy(challenge, 24);
        challenge.writeInt16LE(4, 40);
        challenge.writeInt16LE(4, 42);
        challenge.writeInt32LE(56, 44);
        Buffer.from([0xaa, 0xaa, 0xaa, 0xaa]).copy(challenge, 56);

        connection.write(TYPE.TABULAR_RESULT, buildSspiToken(challenge));

        // NTLM AUTHENTICATE_MESSAGE
        const response = await connection.read();
        assert.strictEqual(response.type, TYPE.SSPI);
        assert.strictEqual(response.data.toString('ascii', 0, 8), 'NTLMSSP\u0000');
        assert.strictEqual(response.data.readUInt32LE(8), 3);
        assert.strictEqual(response.data.toString('ucs2', 64, 76), 'DOMAIN');
        assert.strictEqual(response.data.toString('ucs2', 76, 84), 'user');

        connection.write(TYPE.TABULAR_RESULT, buildLoginAckToken());

        await handleInitialSql(connection);
      });

      await connect(createConnection({ type: 'ntlm', options: { domain: 'domain', userName: 'user', password: 'password' } }));
    });
  });
});
