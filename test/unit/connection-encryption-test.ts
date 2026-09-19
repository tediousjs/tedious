import { assert } from 'chai';
import * as net from 'net';
import { Connection, ConnectionError } from '../../src/tedious';
import IncomingMessageStream from '../../src/incoming-message-stream';
import OutgoingMessageStream from '../../src/outgoing-message-stream';
import Debug from '../../src/debug';
import Message from '../../src/message';

const TOKEN_VERSION = 0x00;
const TOKEN_ENCRYPTION = 0x01;
const TOKEN_TERMINATOR = 0xFF;

const ENCRYPT_OFF = 0x00;
const ENCRYPT_ON = 0x01;
const ENCRYPT_NOT_SUP = 0x02;
const ENCRYPT_REQ = 0x03;

/**
 * Builds a raw PRELOGIN response payload containing a VERSION option and,
 * unless `encryption` is `undefined`, an ENCRYPTION option with the given value.
 */
function buildPreloginResponse(encryption: number | undefined): Buffer {
  const options: { token: number, data: Buffer }[] = [
    { token: TOKEN_VERSION, data: Buffer.from([0x01, 0x02, 0x00, 0x03, 0x00, 0x00]) }
  ];

  if (encryption !== undefined) {
    options.push({ token: TOKEN_ENCRYPTION, data: Buffer.from([encryption]) });
  }

  const headerLength = 5 * options.length + 1;
  const dataLength = options.reduce((sum, option) => sum + option.data.length, 0);
  const buffer = Buffer.alloc(headerLength + dataLength);

  let optionOffset = 0;
  let dataOffset = headerLength;
  for (const option of options) {
    buffer.writeUInt8(option.token, optionOffset);
    buffer.writeUInt16BE(dataOffset, optionOffset + 1);
    buffer.writeUInt16BE(option.data.length, optionOffset + 3);
    option.data.copy(buffer, dataOffset);
    optionOffset += 5;
    dataOffset += option.data.length;
  }
  buffer.writeUInt8(TOKEN_TERMINATOR, optionOffset);

  return buffer;
}

describe('Connection encryption negotiation', function() {
  let server: net.Server;
  let _connections: net.Socket[];

  beforeEach(function(done) {
    _connections = [];
    server = net.createServer();
    server.listen(0, '127.0.0.1', done);
  });

  afterEach(function(done) {
    _connections.forEach((connection) => {
      connection.destroy();
    });

    server.close(done);
  });

  /**
   * Sets up a fake server that answers the client's PRELOGIN message with the
   * given response, and then records the types of all further messages it
   * receives until the client closes the connection.
   */
  function setupServer(preloginResponse: Buffer): Promise<number[]> {
    return new Promise((resolve) => {
      server.on('connection', async (connection) => {
        _connections.push(connection);

        const debug = new Debug();
        const incomingMessageStream = new IncomingMessageStream(debug);
        const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

        connection.pipe(incomingMessageStream);
        outgoingMessageStream.pipe(connection);

        const receivedMessageTypes: number[] = [];

        try {
          const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

          // PRELOGIN
          {
            const { value: message } = await messageIterator.next();
            assert.strictEqual(message.type, 0x12);

            const chunks: Buffer[] = [];
            for await (const chunk of message) {
              chunks.push(chunk);
            }

            const responseMessage = new Message({ type: 0x12 });
            responseMessage.end(preloginResponse);
            outgoingMessageStream.write(responseMessage);
          }

          // Record everything else the client sends until it closes the socket.
          while (true) {
            const { done, value: message } = await messageIterator.next();
            if (done) {
              break;
            }

            receivedMessageTypes.push(message.type);

            const chunks: Buffer[] = [];
            for await (const chunk of message) {
              chunks.push(chunk);
            }
          }
        } catch (err: any) {
          if (err.code !== 'ECONNRESET') {
            console.log(err);
          }
        }

        resolve(receivedMessageTypes);
      });
    });
  }

  function createConnection(encrypt: boolean) {
    return new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: encrypt
      }
    });
  }

  describe('with `encrypt: true`', function() {
    for (const [description, encryption] of [
      ['ENCRYPT_OFF', ENCRYPT_OFF],
      ['ENCRYPT_NOT_SUP', ENCRYPT_NOT_SUP],
      ['an unknown encryption value', 0x42],
      ['no ENCRYPTION option', undefined]
    ] as [string, number | undefined][]) {
      it(`fails without sending LOGIN7 when the server responds with ${description}`, async function() {
        const serverMessages = setupServer(buildPreloginResponse(encryption));

        const connection = createConnection(true);

        const err = await new Promise<Error | undefined>((resolve) => {
          connection.connect(resolve);
        });

        connection.close();

        assert.instanceOf(err, ConnectionError);
        assert.strictEqual((err as ConnectionError).code, 'EENCRYPT');
        assert.match(err!.message, /^Server does not support encryption/);

        // The client must not have sent a LOGIN7 packet (type 0x10) over the
        // unencrypted socket.
        assert.deepEqual(await serverMessages, []);
      });
    }
  });

  describe('with `encrypt: false`', function() {
    it('fails without sending LOGIN7 when the server responds with ENCRYPT_REQ', async function() {
      const serverMessages = setupServer(buildPreloginResponse(ENCRYPT_REQ));

      const connection = createConnection(false);

      const err = await new Promise<Error | undefined>((resolve) => {
        connection.connect(resolve);
      });

      connection.close();

      assert.instanceOf(err, ConnectionError);
      assert.strictEqual((err as ConnectionError).code, 'EENCRYPT');
      assert.match(err!.message, /^Server requires encryption/);

      assert.deepEqual(await serverMessages, []);
    });

    it('fails without sending LOGIN7 when the server responds with ENCRYPT_ON', async function() {
      const serverMessages = setupServer(buildPreloginResponse(ENCRYPT_ON));

      const connection = createConnection(false);

      const err = await new Promise<Error | undefined>((resolve) => {
        connection.connect(resolve);
      });

      connection.close();

      assert.instanceOf(err, ConnectionError);
      assert.strictEqual((err as ConnectionError).code, 'EENCRYPT');

      assert.deepEqual(await serverMessages, []);
    });

    it('continues with LOGIN7 over the unencrypted socket when the server responds with ENCRYPT_NOT_SUP', async function() {
      const serverMessages = setupServer(buildPreloginResponse(ENCRYPT_NOT_SUP));

      const connection = createConnection(false);

      const loginReceived = new Promise<void>((resolve) => {
        connection.on('debug', (message: string) => {
          if (message.includes('SentLogin7WithStandardLogin')) {
            resolve();
          }
        });
      });

      const connectResult = new Promise<Error | undefined>((resolve) => {
        connection.connect(resolve);
      });

      await loginReceived;
      // Give the LOGIN7 packet time to reach the fake server, then hang up.
      await new Promise((resolve) => setTimeout(resolve, 50));
      connection.close();

      await connectResult;

      assert.deepEqual(await serverMessages, [0x10]);
    });
  });
});
