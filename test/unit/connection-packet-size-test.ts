import { assert } from 'chai';
import * as net from 'net';
import { Connection, Request } from '../../src/tedious';
import IncomingMessageStream from '../../src/incoming-message-stream';
import OutgoingMessageStream from '../../src/outgoing-message-stream';
import Debug from '../../src/debug';
import PreloginPayload from '../../src/prelogin-payload';
import Message from '../../src/message';

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

function buildDoneToken(): Buffer {
  const buffer = Buffer.alloc(13);

  let offset = 0;
  offset = buffer.writeUInt8(0xFD, offset); // DONE
  offset = buffer.writeUInt16LE(0x0000, offset); // status = DONE_FINAL
  offset = buffer.writeUInt16LE(0x0000, offset); // curCmd
  buffer.writeBigUInt64LE(0n, offset); // rowCount

  return buffer;
}

/**
 * Builds an `ENVCHANGE` token that changes the packet size.
 */
function buildPacketSizeChangeToken(newSize: string, oldSize = '4096'): Buffer {
  const newValue = Buffer.from(newSize, 'ucs2');
  const oldValue = Buffer.from(oldSize, 'ucs2');

  const data = Buffer.concat([
    Buffer.from([0x04]), // PACKET_SIZE
    Buffer.from([newSize.length]), newValue,
    Buffer.from([oldSize.length]), oldValue,
  ]);

  const buffer = Buffer.alloc(3 + data.length);
  buffer.writeUInt8(0xE3, 0); // ENVCHANGE
  buffer.writeUInt16LE(data.length, 1);
  data.copy(buffer, 3);

  return buffer;
}

async function drainMessage(message: Message): Promise<void> {
  const iterator = message[Symbol.asyncIterator]();
  while (!(await iterator.next()).done) {
    // Discard the data.
  }
}

/**
 * Serves the prelogin / login / initial SQL exchange, inserting the given
 * tokens before the `LOGINACK` token of the login response and responding to
 * the first request after the initial SQL with `requestResponse`.
 */
function serve(server: net.Server, { loginPrefix = Buffer.alloc(0), requestResponse }: { loginPrefix?: Buffer, requestResponse?: Buffer }, onError: (err: Error) => void) {
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
        responseMessage.end(Buffer.concat([loginPrefix, buildLoginAckToken(), buildDoneToken()]));
        outgoingMessageStream.write(responseMessage);
      }

      // SQL Batch (Initial SQL)
      {
        const { value: message, done } = await messageIterator.next();
        if (done) {
          return;
        }
        assert.strictEqual(message.type, 0x01);
        await drainMessage(message);

        const responseMessage = new Message({ type: 0x04 });
        responseMessage.end(buildDoneToken());
        outgoingMessageStream.write(responseMessage);
      }

      // SQL Batch (the request under test)
      if (requestResponse) {
        const { value: message, done } = await messageIterator.next();
        if (done) {
          return;
        }
        assert.strictEqual(message.type, 0x01);
        await drainMessage(message);

        const responseMessage = new Message({ type: 0x04 });
        responseMessage.end(requestResponse);
        outgoingMessageStream.write(responseMessage);
      }
    } catch (err: any) {
      onError(err);
    }
  });
}

describe('A packet size change sent by the server', function() {
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

  function createConnection() {
    return new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false,
      }
    });
  }

  it('is applied when it is valid', function(done) {
    serve(server, { loginPrefix: buildPacketSizeChangeToken('8192') }, done);

    const connection = createConnection();

    connection.connect((err) => {
      assert.isUndefined(err);
      assert.strictEqual(connection.messageIo.outgoingMessageStream.packetSize, 8192);

      connection.close();
      done();
    });
  });

  for (const newSize of ['8', '0', '-1']) {
    it(`fails the login when it is ${newSize}`, function(done) {
      serve(server, { loginPrefix: buildPacketSizeChangeToken(newSize) }, done);

      const connection = createConnection();

      connection.on('error', () => {
        // The parse failure may also be surfaced as a connection error.
      });

      connection.connect((err) => {
        assert.instanceOf(err, Error);
        assert.match(err!.message, /Server sent an invalid packet size/);

        connection.close();
        done();
      });
    });
  }

  it('fails the request when it is invalid', function(done) {
    serve(server, { requestResponse: Buffer.concat([buildPacketSizeChangeToken('8'), buildDoneToken()]) }, done);

    const connection = createConnection();

    connection.on('error', () => {
      // The parse failure is also surfaced as a connection error.
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      const request = new Request('select 1', (err) => {
        assert.instanceOf(err, Error);
        assert.match((err as Error).message, /Server sent an invalid packet size/);

        // The invalid value was never applied.
        assert.strictEqual(connection.messageIo.outgoingMessageStream.packetSize, 4096);

        connection.close();
        done();
      });

      connection.execSqlBatch(request);
    });
  });
});
