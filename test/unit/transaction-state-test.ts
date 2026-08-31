import { assert } from 'chai';
import * as net from 'net';
import { Connection, Request, RequestError } from '../../src/tedious';
import IncomingMessageStream from '../../src/incoming-message-stream';
import OutgoingMessageStream from '../../src/outgoing-message-stream';
import Debug from '../../src/debug';
import PreloginPayload from '../../src/prelogin-payload';
import Message from '../../src/message';

/**
 * Builds a `LOGINACK` token for the given TDS version.
 */
function buildLoginAckToken(tdsVersion: number[]): Buffer {
  const progname = 'Tedious SQL Server';

  const buffer = Buffer.from([
    0xAD, // Type
    0x00, 0x00, // Length
    0x00, // interface number - SQL
    ...tdsVersion, // TDS version number
    Buffer.byteLength(progname, 'ucs2') / 2, ...Buffer.from(progname, 'ucs2'), // Progname
    0x00, // major
    0x00, // minor
    0x00, 0x00, // buildNum
  ]);

  buffer.writeUInt16LE(buffer.length - 3, 1);

  return buffer;
}

/**
 * Builds a final `DONE` token. The row count is 32 bits wide in TDS
 * versions before 7.2.
 */
function buildDoneToken(): Buffer {
  const buffer = Buffer.alloc(9);

  let offset = 0;
  offset = buffer.writeUInt8(0xFD, offset); // DONE
  offset = buffer.writeUInt16LE(0x0000, offset); // status = DONE_FINAL
  offset = buffer.writeUInt16LE(0x0000, offset); // curCmd
  buffer.writeUInt32LE(0, offset); // rowCount

  return buffer;
}

/**
 * Builds an `ERROR` token, as a server would send for a failed statement.
 * The line number is 16 bits wide in TDS versions before 7.2.
 */
function buildErrorToken(message: string): Buffer {
  const messageData = Buffer.from(message, 'ucs2');

  const data = Buffer.alloc(4 + 1 + 1 + 2 + messageData.length + 1 + 1 + 2);

  let offset = 0;
  offset = data.writeUInt32LE(50000, offset); // number
  offset = data.writeUInt8(1, offset); // state
  offset = data.writeUInt8(16, offset); // class
  offset = data.writeUInt16LE(message.length, offset); // message length (in characters)
  offset += messageData.copy(data, offset); // message
  offset = data.writeUInt8(0, offset); // server name length
  offset = data.writeUInt8(0, offset); // proc name length
  data.writeUInt16LE(0, offset); // line number (16 bits before TDS 7.2)

  const buffer = Buffer.alloc(3 + data.length);
  buffer.writeUInt8(0xAA, 0); // ERROR
  buffer.writeUInt16LE(data.length, 1); // token length
  data.copy(buffer, 3);

  return buffer;
}

/**
 * Reads and discards all data of the given message.
 */
async function drainMessage(message: Message): Promise<void> {
  const iterator = message[Symbol.asyncIterator]();
  while (!(await iterator.next()).done) {
    // Discard the data.
  }
}

describe('Emulated transaction state with TDS versions before 7.2', function() {
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

  it('only updates `transactionDepth` and `inTransaction` when the transaction statement succeeded', function(done) {
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

        // LOGIN7 - negotiate TDS 7.1, so the transaction methods take
        // the legacy SQL batch path.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x10);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(Buffer.concat([buildLoginAckToken([0x71, 0x00, 0x00, 0x01]), buildDoneToken()]));
          outgoingMessageStream.write(responseMessage);
        }

        // SQL Batch (Initial SQL)
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end();
          outgoingMessageStream.write(responseMessage);
        }

        // SQL Batch (`BEGIN TRAN`) - fails with a server error.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(Buffer.concat([buildErrorToken('boom'), buildDoneToken()]));
          outgoingMessageStream.write(responseMessage);
        }

        // SQL Batch (`BEGIN TRAN`) - succeeds.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken());
          outgoingMessageStream.write(responseMessage);
        }

        // SQL Batch (`select 1`) - a regular request that is in flight
        // while the client attempts an (invalid) `COMMIT TRAN`.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken());
          outgoingMessageStream.write(responseMessage);
        }

        // SQL Batch (`COMMIT TRAN`) - fails with a server error, which
        // aborts the entire transaction on these TDS versions.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(Buffer.concat([buildErrorToken('boom'), buildDoneToken()]));
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
      assert.isUndefined(err);

      // A failed `BEGIN TRAN` must leave the bookkeeping untouched.
      connection.beginTransaction((err) => {
        assert.instanceOf(err, RequestError);
        assert.strictEqual((err as RequestError).code, 'EREQUEST');
        assert.strictEqual(connection.transactionDepth, 0);
        assert.strictEqual(connection.inTransaction, false);

        // A successful `BEGIN TRAN` updates it.
        connection.beginTransaction((err) => {
          assert.isUndefined(err);
          assert.strictEqual(connection.transactionDepth, 1);
          assert.strictEqual(connection.inTransaction, true);

          // Occupy the connection with a regular request, and attempt a
          // `COMMIT TRAN` while it is in flight. The commit fails with
          // `EINVALIDSTATE` before anything is sent - the bookkeeping
          // must be left untouched.
          const request = new Request('select 1', (err) => {
            assert.isUndefined(err);

            // A `COMMIT TRAN` that fails with a server error aborts the
            // entire transaction on these TDS versions - both parts of
            // the emulated state must be reset together.
            connection.commitTransaction((err) => {
              assert.instanceOf(err, RequestError);
              assert.strictEqual((err as RequestError).code, 'EREQUEST');
              assert.strictEqual(connection.transactionDepth, 0);
              assert.strictEqual(connection.inTransaction, false);

              connection.close();
            });
          });

          connection.execSqlBatch(request);

          connection.commitTransaction((err) => {
            assert.instanceOf(err, RequestError);
            assert.strictEqual((err as RequestError).code, 'EINVALIDSTATE');
            assert.strictEqual(connection.transactionDepth, 1);
            assert.strictEqual(connection.inTransaction, true);
          });
        });
      });
    });

    connection.on('end', () => {
      done();
    });
  });
});
