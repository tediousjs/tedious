import { assert } from 'chai';
import * as net from 'net';
import { Connection } from '../../src/tedious';
import { ConnectionError } from '../../src/errors';
import IncomingMessageStream from '../../src/incoming-message-stream';
import OutgoingMessageStream from '../../src/outgoing-message-stream';
import Debug from '../../src/debug';
import PreloginPayload from '../../src/prelogin-payload';
import Message from '../../src/message';

/**
 * Builds a TDS 7.4 `LOGINACK` token.
 */
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

/**
 * Builds a `FEATUREEXTACK` token acknowledging JSONSUPPORT with the given
 * feature data.
 */
function buildJsonSupportAckToken(data: Buffer): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt8(0xAE, 0); // FEATUREEXTACK
  header.writeUInt8(0x0D, 1); // JSONSUPPORT
  header.writeUInt32LE(data.length, 2);

  return Buffer.concat([header, data, Buffer.from([0xFF])]); // TERMINATOR
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

async function drainMessage(message: Message): Promise<void> {
  const iterator = message[Symbol.asyncIterator]();
  while (!(await iterator.next()).done) {
    // Discard the data.
  }
}

/**
 * Handles the PRELOGIN / LOGIN7 / initial SQL exchange of a single client
 * connection, acknowledging JSONSUPPORT with the given feature data in the
 * LOGIN7 response, or not acknowledging it at all if there is none. The
 * initial SQL is only answered if the client sends it, i.e. if the login
 * succeeded.
 */
async function handleConnection(connection: net.Socket, jsonSupportAckData: Buffer | undefined): Promise<void> {
  const debug = new Debug();
  const incomingMessageStream = new IncomingMessageStream(debug);
  const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

  connection.pipe(incomingMessageStream);
  outgoingMessageStream.pipe(connection);

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

    const tokens = [buildLoginAckToken()];
    if (jsonSupportAckData !== undefined) {
      tokens.push(buildJsonSupportAckToken(jsonSupportAckData));
    }
    tokens.push(buildDoneToken());

    const responseMessage = new Message({ type: 0x04 });
    responseMessage.end(Buffer.concat(tokens));
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
    responseMessage.end();
    outgoingMessageStream.write(responseMessage);
  }
}

describe('JSONSUPPORT negotiation', function() {
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

  /**
   * Connects to the fake server, which acknowledges JSONSUPPORT with the
   * given feature data (or not at all), and reports the outcome of
   * `connect()`.
   */
  function performLogin(jsonSupportAckData: Buffer | undefined, callback: (err: Error | undefined, connection: Connection) => void) {
    server.once('connection', (socket) => {
      handleConnection(socket, jsonSupportAckData).catch((err) => {
        callback(err, connection);
      });
    });

    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false,
        maxRetriesOnTransientErrors: 0
      }
    });

    connection.connect((err) => {
      if (err) {
        return callback(err, connection);
      }

      connection.on('end', () => {
        callback(undefined, connection);
      });
      connection.close();
    });
  }

  it('marks the server as json capable for a version 1 acknowledgement', function(done) {
    performLogin(Buffer.from([0x01]), (err, connection) => {
      if (err) {
        return done(err);
      }

      assert.isTrue(connection.serverSupportsJson);
      done();
    });
  });

  it('logs in without json support when the server does not acknowledge JSONSUPPORT', function(done) {
    performLogin(undefined, (err, connection) => {
      if (err) {
        return done(err);
      }

      assert.isFalse(connection.serverSupportsJson);
      done();
    });
  });

  for (const [description, data] of [
    ['an unknown version', Buffer.from([0x02])],
    ['version 0', Buffer.from([0x00])],
    ['no data', Buffer.alloc(0)],
    ['extra data', Buffer.from([0x01, 0x01])]
  ] as const) {
    it(`fails the login for an acknowledgement with ${description}`, function(done) {
      performLogin(data, (err, connection) => {
        assert.instanceOf(err, ConnectionError);
        assert.strictEqual(err!.message, 'Received invalid JSON support acknowledgement');
        assert.isFalse(connection.serverSupportsJson);
        done();
      });
    });
  }
});
