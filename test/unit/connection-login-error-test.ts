import { assert } from 'chai';
import * as net from 'net';
import { Connection, ConnectionError } from '../../src/tedious';
import IncomingMessageStream from '../../src/incoming-message-stream';
import OutgoingMessageStream from '../../src/outgoing-message-stream';
import Debug from '../../src/debug';
import PreloginPayload from '../../src/prelogin-payload';
import Message from '../../src/message';

/**
 * Reads and discards all data of the given message.
 */
async function drainMessage(message: Message): Promise<void> {
  const iterator = message[Symbol.asyncIterator]();
  while (!(await iterator.next()).done) {
    // Discard the data.
  }
}

/**
 * Builds an `ERROR` token (TDS 7.2+ layout).
 */
function buildErrorToken({ number, state, class: clazz, message, serverName }: { number: number, state: number, class: number, message: string, serverName: string }): Buffer {
  const messageData = Buffer.from(message, 'ucs2');
  const serverNameData = Buffer.from(serverName, 'ucs2');

  const data = Buffer.alloc(4 + 1 + 1 + 2 + messageData.length + 1 + serverNameData.length + 1 + 4);

  let offset = 0;
  offset = data.writeInt32LE(number, offset);
  offset = data.writeUInt8(state, offset);
  offset = data.writeUInt8(clazz, offset);
  offset = data.writeUInt16LE(message.length, offset); // message length (in characters)
  offset += messageData.copy(data, offset);
  offset = data.writeUInt8(serverName.length, offset); // server name length (in characters)
  offset += serverNameData.copy(data, offset);
  offset = data.writeUInt8(0, offset); // proc name length
  data.writeInt32LE(1, offset); // line number

  const buffer = Buffer.alloc(3 + data.length);
  buffer.writeUInt8(0xAA, 0); // ERROR
  buffer.writeUInt16LE(data.length, 1);
  data.copy(buffer, 3);

  return buffer;
}

/**
 * Builds a final `DONE` token with the error flag set.
 */
function buildDoneErrorToken(): Buffer {
  const buffer = Buffer.alloc(13);

  let offset = 0;
  offset = buffer.writeUInt8(0xFD, offset); // DONE
  offset = buffer.writeUInt16LE(0x0002, offset); // status = DONE_ERROR
  offset = buffer.writeUInt16LE(0x0000, offset); // curCmd
  buffer.writeBigUInt64LE(0n, offset); // rowCount

  return buffer;
}

describe('A login rejected by the server', function() {
  let server: net.Server;
  let _connections: net.Socket[];

  beforeEach(function(done) {
    _connections = [];
    server = net.createServer((connection) => {
      _connections.push(connection);
    });
    server.listen(0, '127.0.0.1', done);
  });

  afterEach(function(done) {
    _connections.forEach((connection) => {
      connection.destroy();
    });

    server.close(done);
  });

  it('fails with a ConnectionError carrying the server error details', function(done) {
    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        // PRELOGIN
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x12);
          await drainMessage(message);

          const responsePayload = new PreloginPayload({ encrypt: false, version: { major: 1, minor: 2, build: 3, subbuild: 0 } });
          const responseMessage = new Message({ type: 0x12 });
          responseMessage.end(responsePayload.data);
          outgoingMessageStream.write(responseMessage);
        }

        // LOGIN7
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x10);
          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(Buffer.concat([
            buildErrorToken({ number: 18456, state: 1, class: 14, message: 'Login failed for user \'bad-user\'.', serverName: 'testserver' }),
            buildDoneErrorToken()
          ]));
          outgoingMessageStream.write(responseMessage);
        }
      } catch (err: any) {
        done(err);
      }
    });

    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false
      }
    });

    connection.connect((err) => {
      connection.close();

      try {
        assert.instanceOf(err, ConnectionError);
        const error = err as ConnectionError;
        assert.strictEqual(error.code, 'ELOGIN');
        assert.strictEqual(error.message, 'Login failed for user \'bad-user\'.');
        assert.strictEqual(error.number, 18456);
        assert.strictEqual(error.state, 1);
        assert.strictEqual(error.class, 14);
        assert.strictEqual(error.serverName, 'testserver');
      } catch (assertionError) {
        return done(assertionError);
      }

      done();
    });
  });
});
