import { assert } from 'chai';
import * as net from 'net';

import { Connection, ConnectionError } from '../../../src/tedious';
import IncomingMessageStream from '../../../src/incoming-message-stream';
import OutgoingMessageStream from '../../../src/outgoing-message-stream';
import Debug from '../../../src/debug';
import PreloginPayload from '../../../src/prelogin-payload';
import Message from '../../../src/message';

const COLUMNENCRYPTION = 0x04;
const UTF8_SUPPORT = 0x0A;

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

function buildFeatureExtAckToken(features: number[]): Buffer {
  return Buffer.from([
    0xAE, // Type
    ...features.flatMap((featureId) => [featureId, 0x01, 0x00, 0x00, 0x00, 0x01]), // each with a single byte of data
    0xFF // Terminator
  ]);
}

/**
 * The ids of the features that a `LOGIN7` message asks for.
 */
function requestedFeatures(login7: Buffer): number[] {
  const features = [];

  let offset = login7.readUInt32LE(login7.readUInt16LE(56));
  while (login7[offset] !== 0xFF) {
    features.push(login7[offset]);
    offset += 1 + 4 + login7.readUInt32LE(offset + 1);
  }

  return features;
}

describe('Negotiating column encryption', function() {
  let server: net.Server;

  // The features the client asked for, and the ones the server acknowledges.
  let requested: number[] | undefined;
  let acknowledged: number[];

  beforeEach(function(done) {
    requested = undefined;
    acknowledged = [];

    server = net.createServer(async (socket) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      socket.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(socket);

      async function readMessage(type: number): Promise<Buffer> {
        const { value: message } = await messageIterator.next();
        assert.strictEqual(message.type, type);

        const chunks: Buffer[] = [];
        for await (const data of message) {
          chunks.push(data);
        }

        return Buffer.concat(chunks);
      }

      const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

      try {
        // PRELOGIN
        await readMessage(0x12);
        {
          const responsePayload = new PreloginPayload({ encrypt: false, version: { major: 0, minor: 0, build: 0, subbuild: 0 } });
          const responseMessage = new Message({ type: 0x12 });
          responseMessage.end(responsePayload.data);
          outgoingMessageStream.write(responseMessage);
        }

        // LOGIN7
        requested = requestedFeatures(await readMessage(0x10));
        {
          const responseMessage = new Message({ type: 0x04 });
          responseMessage.write(buildLoginAckToken());
          responseMessage.end(buildFeatureExtAckToken(acknowledged));
          outgoingMessageStream.write(responseMessage);
        }

        // SQL Batch (Initial SQL), unless the client gave up on the login
        const { value: message, done } = await messageIterator.next();
        if (!done) {
          assert.strictEqual(message.type, 0x01);
          message.resume();

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end();
          outgoingMessageStream.write(responseMessage);

          await messageIterator.next();
        }
      } catch (err) {
        process.nextTick(() => {
          throw err;
        });
      } finally {
        socket.end();
      }
    });

    server.on('error', done);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', done);
      done();
    });
  });

  afterEach(function(done) {
    server.close(done);
  });

  function connect(columnEncryption: boolean): Promise<Connection> {
    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false,
        columnEncryption: columnEncryption ? { keyStoreProviders: {} } : undefined
      }
    });

    return new Promise((resolve, reject) => {
      connection.connect((err) => {
        if (err) {
          return reject(err);
        }

        resolve(connection);
      });
    });
  }

  function close(connection: Connection): Promise<void> {
    return new Promise((resolve) => {
      connection.on('end', resolve);
      connection.close();
    });
  }

  it('asks for column encryption if the `columnEncryption` option is set', async function() {
    acknowledged = [COLUMNENCRYPTION, UTF8_SUPPORT];

    const connection = await connect(true);

    try {
      assert.deepEqual(requested, [COLUMNENCRYPTION, UTF8_SUPPORT]);
      assert.isTrue(connection.config.options.serverSupportsColumnEncryption);
    } finally {
      await close(connection);
    }
  });

  it('fails to connect if the server does not acknowledge column encryption', async function() {
    acknowledged = [UTF8_SUPPORT];

    let error: unknown;
    try {
      await close(await connect(true));
    } catch (err) {
      error = err;
    }

    assert.instanceOf(error, ConnectionError);
    assert.strictEqual((error as ConnectionError).code, 'ECOLUMNENCRYPTION');
    assert.strictEqual((error as ConnectionError).message, 'The server does not support Always Encrypted, which the "columnEncryption" option asks for.');
    assert.deepEqual(requested, [COLUMNENCRYPTION, UTF8_SUPPORT]);
  });

  it('does not ask for column encryption without the `columnEncryption` option', async function() {
    acknowledged = [UTF8_SUPPORT];

    const connection = await connect(false);

    try {
      assert.deepEqual(requested, [UTF8_SUPPORT]);
      assert.isFalse(connection.config.options.serverSupportsColumnEncryption);
    } finally {
      await close(connection);
    }
  });

  it('ignores an acknowledgement of column encryption that it did not ask for', async function() {
    acknowledged = [COLUMNENCRYPTION, UTF8_SUPPORT];

    const connection = await connect(false);

    try {
      assert.isFalse(connection.config.options.serverSupportsColumnEncryption);
    } finally {
      await close(connection);
    }
  });
});
