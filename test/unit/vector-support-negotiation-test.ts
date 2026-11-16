import { assert } from 'chai';
import * as net from 'net';
import { Connection, Request, TYPES } from '../../src/tedious';
import IncomingMessageStream from '../../src/incoming-message-stream';
import OutgoingMessageStream from '../../src/outgoing-message-stream';
import Debug from '../../src/debug';
import PreloginPayload from '../../src/prelogin-payload';
import Message from '../../src/message';
import { type ConnectionConfiguration } from '../../src/connection';
import { parseLogin7FeatureExt } from '../helpers/login7-feature-ext';

function buildLoginAckToken(tdsVersion: number[] = [0x74, 0x00, 0x00, 0x04]): Buffer {
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

function buildFeatureExtAckToken(vectorSupport: number[]): Buffer {
  return Buffer.from([
    0xAE, // FEATUREEXTACK
    0x0A, 0x01, 0x00, 0x00, 0x00, 0x01, // UTF8_SUPPORT
    0x0E, ...Buffer.from(new Uint32Array([vectorSupport.length]).buffer), ...vectorSupport, // VECTORSUPPORT
    0xFF // TERMINATOR
  ]);
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

async function readMessage(message: Message): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of message) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

interface MockServer {
  server: net.Server;
  port: number;
  // The LOGIN7 payload of the last login.
  login7: Buffer | undefined;
  // The types of messages received after the login sequence.
  requests: number[];
}

/**
 * A server that answers the login with the given acknowledgement tokens, and
 * every request after the initial SQL with a `DONE` token.
 */
async function startServer(loginResponse: Buffer[]): Promise<MockServer> {
  const mock: MockServer = { server: net.createServer(), port: 0, login7: undefined, requests: [] };

  mock.server.on('connection', async (connection) => {
    const debug = new Debug();
    const incomingMessageStream = new IncomingMessageStream(debug);
    const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

    connection.pipe(incomingMessageStream);
    outgoingMessageStream.pipe(connection);
    connection.on('error', () => {});

    try {
      const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

      // PRELOGIN
      let { value: message } = await messageIterator.next();
      await readMessage(message);
      let responseMessage = new Message({ type: 0x12 });
      responseMessage.end(new PreloginPayload({ encrypt: false, version: { major: 17, minor: 0, build: 1000, subbuild: 0 } }).data);
      outgoingMessageStream.write(responseMessage);

      // LOGIN7
      ({ value: message } = await messageIterator.next());
      assert.strictEqual(message.type, 0x10);
      mock.login7 = await readMessage(message);
      responseMessage = new Message({ type: 0x04 });
      responseMessage.end(Buffer.concat([...loginResponse, buildDoneToken()]));
      outgoingMessageStream.write(responseMessage);

      // Initial SQL, then the requests under test.
      let initialSql = true;
      while (true) {
        const { value: request, done } = await messageIterator.next();
        if (done) {
          break;
        }

        await readMessage(request);
        if (!initialSql) {
          mock.requests.push(request.type);
        }
        initialSql = false;

        responseMessage = new Message({ type: 0x04 });
        responseMessage.end(buildDoneToken());
        outgoingMessageStream.write(responseMessage);
      }
    } catch {
      connection.destroy();
    }
  });

  await new Promise<void>((resolve) => mock.server.listen(0, '127.0.0.1', resolve));
  mock.port = (mock.server.address() as net.AddressInfo).port;
  return mock;
}

function connect(mock: MockServer, options: ConnectionConfiguration['options'] = {}): Promise<Connection> {
  const connection = new Connection({
    server: '127.0.0.1',
    authentication: { type: 'default', options: { userName: 'u', password: 'p' } },
    options: { port: mock.port, encrypt: false, ...options }
  });

  return new Promise((resolve, reject) => {
    connection.connect((err) => {
      if (err) {
        connection.close();
        reject(err);
      } else {
        resolve(connection);
      }
    });
  });
}

function execSql(connection: Connection, sql: string, addParameters: (request: Request) => void = () => {}): Promise<(Error & { code?: string }) | null | undefined> {
  return new Promise((resolve) => {
    const request = new Request(sql, resolve);
    addParameters(request);
    connection.execSql(request);
  });
}

// The VECTORSUPPORT version requested in a LOGIN7 payload, or `undefined` if
// vector support was not requested.
function requestedVectorSupport(login7: Buffer): number | undefined {
  const data = parseLogin7FeatureExt(login7).get(0x0E);
  if (data === undefined) {
    return undefined;
  }
  assert.lengthOf(data, 1, 'VECTORSUPPORT carries a single version byte');
  return data[0];
}

describe('Vector support negotiation', function() {
  let mock: MockServer;
  let connection: Connection | undefined;

  afterEach(function(done) {
    if (connection) {
      connection.close();
      connection = undefined;
    }
    mock.server.close(() => done());
  });

  describe('the login request', function() {
    it('requests version 2 by default', async function() {
      mock = await startServer([buildLoginAckToken()]);
      connection = await connect(mock);
      assert.strictEqual(requestedVectorSupport(mock.login7!), 2);
    });

    it('requests version 1 with `vectorTypeSupport: \'v1\'`', async function() {
      mock = await startServer([buildLoginAckToken()]);
      connection = await connect(mock, { vectorTypeSupport: 'v1' });
      assert.strictEqual(requestedVectorSupport(mock.login7!), 1);
    });

    it('does not request vector support with `vectorTypeSupport: \'off\'`', async function() {
      mock = await startServer([buildLoginAckToken()]);
      connection = await connect(mock, { vectorTypeSupport: 'off' });
      assert.isUndefined(requestedVectorSupport(mock.login7!));
    });
  });

  describe('the acknowledgement', function() {
    it('is not required: servers without vector support do not send one', async function() {
      mock = await startServer([buildLoginAckToken()]);
      connection = await connect(mock);
      assert.strictEqual(connection.vectorSupportVersion, 0);
    });

    for (const version of [1, 2]) {
      it(`records the acknowledged version ${version}`, async function() {
        mock = await startServer([buildLoginAckToken(), buildFeatureExtAckToken([version])]);
        connection = await connect(mock);
        assert.strictEqual(connection.vectorSupportVersion, version);
      });
    }

    const invalid: Array<[string, number[], ConnectionConfiguration['options']]> = [
      ['a version that was not offered', [3], {}],
      ['a version above the requested one', [2], { vectorTypeSupport: 'v1' }],
      ['an acknowledgement for vector support that was not requested', [1], { vectorTypeSupport: 'off' }],
      ['version 0', [0], {}],
      ['no data', [], {}],
      ['extra data', [1, 1], {}]
    ];
    for (const [description, data, options] of invalid) {
      it(`fails the login for ${description}`, async function() {
        mock = await startServer([buildLoginAckToken(), buildFeatureExtAckToken(data)]);
        let error: Error | undefined;
        try {
          connection = await connect(mock, options);
        } catch (err) {
          error = err as Error;
        }
        assert.instanceOf(error, Error);
        assert.strictEqual(error!.message, 'Received invalid vector support acknowledgement');
      });
    }
  });

  describe('sending vector values', function() {
    it('sends `TYPES.Vector` parameters once version 1 was negotiated', async function() {
      mock = await startServer([buildLoginAckToken(), buildFeatureExtAckToken([1])]);
      connection = await connect(mock);

      assert.isUndefined(await execSql(connection, 'SELECT @v', (request) => request.addParameter('v', TYPES.Vector, [1, 2, 3])));
      assert.deepEqual(mock.requests, [0x03]);
    });

    it('rejects `TYPES.Vector` parameters if the server did not acknowledge vector support', async function() {
      mock = await startServer([buildLoginAckToken()]);
      connection = await connect(mock);

      const error = await execSql(connection, 'SELECT @v', (request) => request.addParameter('v', TYPES.Vector, null, { length: 3 }));
      assert.strictEqual(error?.code, 'EVECTORNOTSUPPORTED');
      assert.include(error!.message, 'The server does not support the `vector` data type');
      assert.deepEqual(mock.requests, []);
    });

    it('rejects `TYPES.VectorFloat16` parameters if only version 1 was negotiated', async function() {
      mock = await startServer([buildLoginAckToken(), buildFeatureExtAckToken([1])]);
      connection = await connect(mock);

      const error = await execSql(connection, 'SELECT @v', (request) => request.addParameter('v', TYPES.VectorFloat16, [1]));
      assert.strictEqual(error?.code, 'EVECTORNOTSUPPORTED');
      assert.include(error!.message, 'The server only supports vector support version 1');
      assert.deepEqual(mock.requests, []);
    });

    it('sends `TYPES.VectorFloat16` parameters once version 2 was negotiated', async function() {
      mock = await startServer([buildLoginAckToken(), buildFeatureExtAckToken([2])]);
      connection = await connect(mock);

      assert.isUndefined(await execSql(connection, 'SELECT @v', (request) => request.addParameter('v', TYPES.VectorFloat16, [1])));
      assert.deepEqual(mock.requests, [0x03]);
    });

    it('rejects vector parameters with `vectorTypeSupport: \'off\'`', async function() {
      mock = await startServer([buildLoginAckToken()]);
      connection = await connect(mock, { vectorTypeSupport: 'off' });

      const error = await execSql(connection, 'SELECT @v', (request) => request.addParameter('v', TYPES.Vector, [1]));
      assert.strictEqual(error?.code, 'EVECTORNOTSUPPORTED');
      assert.include(error!.message, 'disables vector support');
    });

    it('rejects `TYPES.VectorFloat16` parameters with `vectorTypeSupport: \'v1\'`', async function() {
      mock = await startServer([buildLoginAckToken(), buildFeatureExtAckToken([1])]);
      connection = await connect(mock, { vectorTypeSupport: 'v1' });

      const error = await execSql(connection, 'SELECT @v', (request) => request.addParameter('v', TYPES.VectorFloat16, [1]));
      assert.strictEqual(error?.code, 'EVECTORNOTSUPPORTED');
      assert.include(error!.message, 'requests only version 1');
    });

    it('rejects vector parameters on TDS versions before 7.4', async function() {
      mock = await startServer([buildLoginAckToken([0x73, 0x0B, 0x00, 0x03])]);
      connection = await connect(mock, { tdsVersion: '7_3_B' });

      const error = await execSql(connection, 'SELECT @v', (request) => request.addParameter('v', TYPES.Vector, [1]));
      assert.strictEqual(error?.code, 'EVECTORNOTSUPPORTED');
      assert.include(error!.message, 'is lower than `7_4`');
    });

    it('rejects table-valued parameters with vector columns', async function() {
      mock = await startServer([buildLoginAckToken(), buildFeatureExtAckToken([1])]);
      connection = await connect(mock);

      const error = await execSql(connection, 'SELECT * FROM @t', (request) => request.addParameter('t', TYPES.TVP, {
        name: 'vectors',
        columns: [{ name: 'id', type: TYPES.Int }, { name: 'v', type: TYPES.VectorFloat16, length: 2 }],
        rows: [[1, [1, 2]]]
      }));
      assert.strictEqual(error?.code, 'EVECTORNOTSUPPORTED');
      assert.deepEqual(mock.requests, []);
    });

    it('rejects bulk loads into vector columns before sending the `INSERT BULK` statement', async function() {
      mock = await startServer([buildLoginAckToken()]);
      connection = await connect(mock);

      const rows = (function * () {
        yield { v: [1, 2] };
      })();

      const error = await new Promise<Error | null | undefined>((resolve) => {
        const bulkLoad = connection!.newBulkLoad('#vectors', resolve);
        bulkLoad.addColumn('v', TYPES.Vector, { length: 2, nullable: true });
        connection!.execBulkLoad(bulkLoad, rows);
      }) as Error & { code: string };

      assert.strictEqual(error?.code, 'EVECTORNOTSUPPORTED');
      assert.deepEqual(mock.requests, []);
      // The row source was closed.
      assert.isTrue(rows.next().done);

      // The connection is still usable.
      assert.isUndefined(await execSql(connection!, 'SELECT 1'));
    });
  });
});

describe('`vectorTypeSupport` connection option', function() {
  function create(options: object) {
    const connection = new Connection({ server: 'localhost', options: { encrypt: false, ...options } });
    connection.close();
    return connection;
  }

  it('defaults to `v2`', function() {
    assert.strictEqual(create({}).config.options.vectorTypeSupport, 'v2');
  });

  it('accepts `off`, `v1` and `v2`', function() {
    for (const value of ['off', 'v1', 'v2']) {
      assert.strictEqual(create({ vectorTypeSupport: value }).config.options.vectorTypeSupport, value);
    }
  });

  it('rejects other values', function() {
    for (const value of ['V2', 'v3', 'on', true, 2, 'toString', null]) {
      assert.throws(() => create({ vectorTypeSupport: value }), TypeError, 'The "config.options.vectorTypeSupport" property must be one of \'off\', \'v1\' or \'v2\'.');
    }
  });
});
