import { Connection } from '../../src/tedious';
import { azureActiveDirectoryPasswordDeprecationWarning } from '../../src/token/handler';
import { assert } from 'chai';
import * as sinon from 'sinon';
import { UsernamePasswordCredential } from '@azure/identity';
import { Socket } from 'net';
import MessageIO from '../../src/message-io';
import Message from '../../src/message';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';

describe('Azure Active Directory password authentication deprecation warning', function() {
  const config = {
    server: 'localhost',
    authentication: {
      type: 'azure-active-directory-password' as const,
      options: {
        clientId: 'client-id',
        userName: 'user',
        password: 'password'
      }
    }
  };

  let sandbox: sinon.SinonSandbox;
  let emitWarning: sinon.SinonStub;
  let previouslyEmitted: boolean;
  let connections: Connection[];

  beforeEach(function() {
    previouslyEmitted = azureActiveDirectoryPasswordDeprecationWarning.emitted;
    azureActiveDirectoryPasswordDeprecationWarning.emitted = false;
    sandbox = sinon.createSandbox();
    emitWarning = sandbox.stub(process, 'emitWarning');
    connections = [];
  });

  afterEach(function() {
    for (const connection of connections) {
      connection.messageIo?.socket.destroy();
      connection.close();
    }
    sandbox.restore();
    azureActiveDirectoryPasswordDeprecationWarning.emitted = previouslyEmitted;
  });

  function createConnection(connectionConfig = config) {
    const connection = new Connection(connectionConfig);
    connections.push(connection);
    return connection;
  }

  async function performAuthentication(connection: Connection) {
    const spn = Buffer.from('https://database.windows.net/', 'ucs2');
    const stsurl = Buffer.from('https://login.microsoftonline.com/common', 'ucs2');
    const buffer = new WritableTrackingBuffer();
    buffer.writeUInt8(0xEE);
    buffer.writeUInt32LE(22 + spn.length + stsurl.length);
    buffer.writeUInt32LE(2);
    buffer.writeUInt8(2);
    buffer.writeUInt32LE(spn.length);
    buffer.writeUInt32LE(22);
    buffer.writeUInt8(1);
    buffer.writeUInt32LE(stsurl.length);
    buffer.writeUInt32LE(22 + spn.length);
    buffer.writeBuffer(spn);
    buffer.writeBuffer(stsurl);

    const message = new Message({ type: 0x04 });
    message.end(buffer.data);
    connection.messageIo = new MessageIO(new Socket(), 4096, connection.debug);
    sandbox.stub(connection.messageIo, 'readMessage').resolves(message);
    sandbox.stub(connection, 'sendFedAuthTokenMessage');
    sandbox.stub(connection, 'performSentLogin7WithStandardLogin').resolves();

    await connection.performSentLogin7WithFedAuth(new AbortController().signal);
  }

  it('emits a deprecation warning once when password authentication is used', async function() {
    const getToken = sandbox.stub(UsernamePasswordCredential.prototype, 'getToken').resolves({
      token: 'token',
      expiresOnTimestamp: Date.now() + 60000
    });

    await performAuthentication(createConnection());
    await performAuthentication(createConnection());

    sinon.assert.calledTwice(getToken);
    sinon.assert.calledOnce(emitWarning);
    const [message, options] = emitWarning.firstCall.args;
    assert.match(message, /azure-active-directory-password.*deprecated/);
    assert.include(message, 'Use `token-credential` authentication with a suitable credential instead.');
    assert.deepEqual(options, { type: 'DeprecationWarning', code: 'TEDIOUS_DEP_AAD_PASSWORD' });
  });

  it('does not warn when a connection is constructed but never connected', function() {
    createConnection();

    sinon.assert.notCalled(emitWarning);
  });

  it('does not warn when configuration validation fails', function() {
    assert.throws(() => new Connection({ ...config, options: { port: -1 } }), RangeError);

    sinon.assert.notCalled(emitWarning);
    assert.isFalse(azureActiveDirectoryPasswordDeprecationWarning.emitted);
  });

  it('does not warn for default authentication', function() {
    const connection = new Connection({ server: 'localhost', authentication: { type: 'default' } });
    connections.push(connection);

    sinon.assert.notCalled(emitWarning);
  });

  it('does not warn when token-credential authentication is used', async function() {
    const getToken = sandbox.stub().resolves({ token: 'token', expiresOnTimestamp: Date.now() + 60000 });
    const connection = new Connection({
      server: 'localhost',
      authentication: { type: 'token-credential', options: { credential: { getToken } } }
    });
    connections.push(connection);

    await performAuthentication(connection);

    sinon.assert.calledOnce(getToken);
    sinon.assert.notCalled(emitWarning);
  });
});
