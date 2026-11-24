import { assert } from 'chai';
import * as net from 'net';
import sinon from 'sinon';
import { Connection, ConnectionError } from '../../src/tedious';
import IncomingMessageStream from '../../src/incoming-message-stream';
import OutgoingMessageStream from '../../src/outgoing-message-stream';
import Debug from '../../src/debug';
import PreloginPayload from '../../src/prelogin-payload';
import Message from '../../src/message';
import * as instanceLookupModule from '../../src/instance-lookup';

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
 * Reads all data of the given message.
 */
async function readMessage(message: Message): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of message) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Returns the raw value of the `INSTOPT` option of a PRELOGIN payload.
 */
function readInstanceOption(data: Buffer): Buffer {
  let offset = 0;
  while (data[offset] !== 0xFF) {
    if (data[offset] === 0x02) {
      const dataOffset = data.readUInt16BE(offset + 1);
      const dataLength = data.readUInt16BE(offset + 3);
      return data.subarray(dataOffset, dataOffset + dataLength);
    }
    offset += 5;
  }
  throw new Error('No INSTOPT option found');
}

/**
 * Builds a PRELOGIN response whose `INSTOPT` value is `instanceResult`.
 */
function buildPreloginResponse(instanceResult: number): Buffer {
  const data = new PreloginPayload({ encrypt: false, version: { major: 1, minor: 2, build: 3, subbuild: 0 } }).data;
  let offset = 0;
  while (data[offset] !== 0x02) {
    offset += 5;
  }
  data.writeUInt8(instanceResult, data.readUInt16BE(offset + 1));
  return data;
}

describe('Connecting with an instance name', function() {
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
   * Serves a PRELOGIN exchange, answering `INSTOPT` with `instanceResult`, and
   * resolves with the client's PRELOGIN payload. If the client continues with
   * LOGIN7, the login is acknowledged and the initial SQL batch is answered.
   */
  function servePrelogin(instanceResult: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
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

            resolve(await readMessage(message));

            const responseMessage = new Message({ type: 0x12 });
            responseMessage.end(buildPreloginResponse(instanceResult));
            outgoingMessageStream.write(responseMessage);
          }

          // LOGIN7
          {
            const { value: message, done } = await messageIterator.next();
            if (done) {
              return;
            }
            assert.strictEqual(message.type, 0x10);
            await readMessage(message);

            const responseMessage = new Message({ type: 0x04 });
            responseMessage.end(buildLoginAckToken());
            outgoingMessageStream.write(responseMessage);
          }

          // SQL Batch (Initial SQL)
          {
            const { value: message, done } = await messageIterator.next();
            if (done) {
              return;
            }
            assert.strictEqual(message.type, 0x01);
            await readMessage(message);

            const responseMessage = new Message({ type: 0x04 });
            responseMessage.end();
            outgoingMessageStream.write(responseMessage);
          }
        } catch (err: any) {
          reject(err);
        }
      });
    });
  }

  afterEach(function() {
    sinon.restore();
  });

  /**
   * Makes the SQL Server Browser lookup return the mock server's port.
   */
  function stubInstanceLookup() {
    return sinon.stub(instanceLookupModule, 'instanceLookup').resolves((server.address() as net.AddressInfo).port);
  }

  function createConnection(options: { instanceName: string, port?: number }) {
    return new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: { ...options, encrypt: false }
    });
  }

  function connect(connection: Connection): Promise<Error | undefined> {
    return new Promise((resolve) => {
      connection.connect(resolve);
    });
  }

  it('sends the instance name in PRELOGIN when the port was looked up', async function() {
    const lookup = stubInstanceLookup();
    const prelogin = servePrelogin(0x00);
    const connection = createConnection({ instanceName: 'SQLEXPRESS' });

    try {
      assert.isUndefined(await connect(connection));
      assert.isTrue(lookup.calledOnce);
      assert.strictEqual(lookup.firstCall.args[0].instanceName, 'SQLEXPRESS');
      assert.deepEqual(readInstanceOption(await prelogin), Buffer.from('SQLEXPRESS\x00'));
    } finally {
      connection.close();
    }
  });

  it('fails with `EINSTLOOKUP` if the server is a different instance than the looked up one', async function() {
    stubInstanceLookup();
    servePrelogin(0x01);
    const connection = createConnection({ instanceName: 'SQLEXPRESS' });

    try {
      const err = await connect(connection);

      assert.instanceOf(err, ConnectionError);
      assert.strictEqual((err as ConnectionError).code, 'EINSTLOOKUP');
      assert.include(err!.message, 'SQLEXPRESS');
      assert.include(err!.message, String((server.address() as net.AddressInfo).port));
    } finally {
      connection.close();
    }
  });

  it('connects to an explicit port directly, without sending the instance name', async function() {
    const lookup = stubInstanceLookup();
    const prelogin = servePrelogin(0x00);
    const connection = createConnection({ instanceName: 'SQLEXPRESS', port: (server.address() as net.AddressInfo).port });

    try {
      assert.isUndefined(await connect(connection));
      assert.isTrue(lookup.notCalled);
      assert.deepEqual(readInstanceOption(await prelogin), Buffer.from([0x00]));
    } finally {
      connection.close();
    }
  });

  for (const instanceName of ['MSSQLSERVER', 'mssqlserver', 'INSTÄNZ']) {
    it(`does not send the instance name '${instanceName}' in PRELOGIN`, async function() {
      stubInstanceLookup();
      const prelogin = servePrelogin(0x00);
      const connection = createConnection({ instanceName });

      try {
        assert.isUndefined(await connect(connection));
        assert.deepEqual(readInstanceOption(await prelogin), Buffer.from([0x00]));
      } finally {
        connection.close();
      }
    });
  }
});
