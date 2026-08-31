import { assert } from 'chai';
import * as net from 'net';
import { Connection } from '../../src/tedious';
import { tds71DeprecationWarning } from '../../src/token/handler';
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
 * versions before 7.2, and 64 bits wide from 7.2 onwards.
 */
function buildDoneToken(use64BitRowCount: boolean): Buffer {
  const buffer = Buffer.alloc(use64BitRowCount ? 13 : 9);

  let offset = 0;
  offset = buffer.writeUInt8(0xFD, offset); // DONE
  offset = buffer.writeUInt16LE(0x0000, offset); // status = DONE_FINAL
  offset = buffer.writeUInt16LE(0x0000, offset); // curCmd

  if (use64BitRowCount) {
    buffer.writeBigUInt64LE(0n, offset); // rowCount
  } else {
    buffer.writeUInt32LE(0, offset); // rowCount
  }

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

/**
 * Handles the PRELOGIN / LOGIN7 / initial SQL exchange of a single client
 * connection, negotiating the given TDS version.
 */
async function handleConnection(connection: net.Socket, tdsVersion: number[]): Promise<void> {
  const debug = new Debug();
  const incomingMessageStream = new IncomingMessageStream(debug);
  const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

  connection.pipe(incomingMessageStream);
  outgoingMessageStream.pipe(connection);

  const messageIterator = incomingMessageStream[Symbol.asyncIterator]();
  const use64BitRowCount = tdsVersion[0] >= 0x72;

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
    responseMessage.end(Buffer.concat([buildLoginAckToken(tdsVersion), buildDoneToken(use64BitRowCount)]));
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
}

describe('TDS 7.1 deprecation warning', function() {
  let server: net.Server;
  let _connections: net.Socket[];
  let warnings: (Error & { code?: string })[];

  const onWarning = (warning: Error & { code?: string }) => {
    if (warning.code === 'TEDIOUS_DEP_TDS71') {
      warnings.push(warning);
    }
  };

  beforeEach(function(done) {
    tds71DeprecationWarning.emitted = false;
    warnings = [];
    process.on('warning', onWarning);

    _connections = [];
    server = net.createServer((connection) => {
      _connections.push(connection);
    });
    server.listen(0, '127.0.0.1', done);
  });

  afterEach(function(done) {
    process.removeListener('warning', onWarning);

    _connections.forEach((connection) => {
      connection.destroy();
    });

    server.close(done);
  });

  /**
   * Connects to the fake server and disconnects again, negotiating the
   * given TDS version.
   */
  function performLogin(tdsVersion: number[], callback: (err?: Error) => void) {
    server.once('connection', (connection) => {
      handleConnection(connection, tdsVersion).catch((err) => {
        callback(err);
      });
    });

    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false
      }
    });

    connection.connect((err) => {
      if (err) {
        return callback(err);
      }

      connection.close();
    });

    connection.on('end', () => {
      callback();
    });
  }

  it('emits a deprecation warning once when TDS 7.1 is negotiated', function(done) {
    performLogin([0x71, 0x00, 0x00, 0x01], (err) => {
      if (err) {
        return done(err);
      }

      // A second connection must not emit the warning again.
      performLogin([0x71, 0x00, 0x00, 0x01], (err) => {
        if (err) {
          return done(err);
        }

        // `process.emitWarning` emits the `'warning'` event asynchronously.
        setImmediate(() => {
          assert.lengthOf(warnings, 1);
          assert.strictEqual(warnings[0].name, 'DeprecationWarning');
          assert.strictEqual(warnings[0].code, 'TEDIOUS_DEP_TDS71');
          assert.match(warnings[0].message, /TDS 7\.1.*deprecated/);

          done();
        });
      });
    });
  });

  it('does not emit a deprecation warning when TDS 7.2 or newer is negotiated', function(done) {
    performLogin([0x74, 0x00, 0x00, 0x04], (err) => {
      if (err) {
        return done(err);
      }

      setImmediate(() => {
        assert.lengthOf(warnings, 0);

        done();
      });
    });
  });
});
