import { assert } from 'chai';
import { once } from 'events';
import { readFileSync } from 'fs';
import * as net from 'net';
import { type Duplex } from 'stream';
import { TLSSocket } from 'tls';
import DuplexPair from 'native-duplexpair';

import Connection, { type ConnectionConfiguration, type ConnectionOptions } from '../../src/connection';
import { ConnectionError } from '../../src/errors';
import Debug from '../../src/debug';
import MessageIO from '../../src/message-io';
import { TYPE } from '../../src/packet';
import PreloginPayload from '../../src/prelogin-payload';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';

const userName = 'loopback-test-user';
const password = 'loopback-test-password';
const token = 'loopback-test-access-token';
const certificate = readFileSync('./test/fixtures/loopback-ip.crt');
const key = readFileSync('./test/fixtures/loopback-ip.key');

const authentications: NonNullable<ConnectionConfiguration['authentication']>[] = [
  { type: 'default', options: { userName, password } },
  { type: 'azure-active-directory-access-token', options: { token } }
];

function preloginResponse(...encryption: number[]): Buffer {
  const dataOffset = 5 * (1 + encryption.length) + 1;
  const data = Buffer.alloc(dataOffset + 6 + encryption.length);
  data.writeUInt16BE(dataOffset, 1);
  data.writeUInt16BE(6, 3);
  for (let i = 0; i < encryption.length; i++) {
    data.writeUInt8(0x01, 5 * (i + 1));
    data.writeUInt16BE(dataOffset + 6 + i, 5 * (i + 1) + 1);
    data.writeUInt16BE(1, 5 * (i + 1) + 3);
    data.writeUInt8(encryption[i], dataOffset + 6 + i);
  }
  data.writeUInt8(0xFF, dataOffset - 1);
  // Retain a valid VERSION even when ENCRYPTION is omitted.
  data.writeUInt8(1, dataOffset);
  return data;
}

async function readMessage(io: MessageIO, type: number): Promise<Buffer> {
  const message = await io.readMessage();
  assert.strictEqual(message.type, type);
  const chunks: Buffer[] = [];
  for await (const chunk of message) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readPrelogin(io: MessageIO, encryption = 0x01): Promise<Buffer> {
  const data = await readMessage(io, TYPE.PRELOGIN);
  assert.strictEqual(data[0], 0x00, 'VERSION must be the first PRELOGIN option');
  assert.strictEqual(new PreloginPayload(data).encryption, encryption);
  return data;
}

function loginAck(): Buffer {
  return Buffer.from([
    0xAD, 0x0A, 0x00, // LOGINACK, length
    0x01, 0x74, 0x00, 0x00, 0x04, // SQL interface, TDS 7.4
    0x00, // Empty program name
    0x00, 0x00, 0x00, 0x00 // Server version
  ]);
}

describe('Connection encryption negotiation', function() {
  let server: net.Server;
  let sockets: net.Socket[];
  let connections: Connection[];
  let securePairs: { cleartext: TLSSocket, encrypted: Duplex }[];

  beforeEach(function(done) {
    sockets = [];
    connections = [];
    securePairs = [];
    server = net.createServer((socket) => {
      sockets.push(socket);
    });
    server.listen(0, '127.0.0.1', done);
  });

  afterEach(function(done) {
    for (const connection of connections) {
      connection.close();
    }
    for (const pair of securePairs) {
      pair.cleartext.destroy();
      pair.encrypted.destroy();
    }
    for (const socket of sockets) {
      socket.destroy();
    }
    server.close(done);
  });

  async function connect(options: ConnectionOptions = {}, authentication = authentications[0]) {
    const address = server.address() as net.AddressInfo;
    const connection = new Connection({
      server: address.address,
      authentication,
      options: {
        port: address.port,
        connectTimeout: 2000,
        connectionRetryInterval: 10,
        ...options
      }
    });
    connections.push(connection);
    const accepted = new Promise<net.Socket>((resolve) => { server.once('connection', resolve); });
    const result = new Promise<Error | undefined>((resolve) => {
      connection.connect(resolve);
    });
    const socket = await accepted;
    return { connection, socket, result };
  }

  function assertNoCredentials(data: Buffer) {
    const encodedPassword = Buffer.from(password, 'ucs2');
    for (let i = 0; i < encodedPassword.length; i++) {
      const byte = encodedPassword[i];
      encodedPassword[i] = ((byte << 4) & 0xF0 | (byte >> 4)) ^ 0xA5;
    }
    for (const marker of [Buffer.from(userName, 'ucs2'), Buffer.from(password, 'ucs2'), encodedPassword, Buffer.from(token, 'ucs2')]) {
      assert.isFalse(data.includes(marker), 'credentials must not be sent in plaintext');
    }
  }

  async function assertRejected(response: Buffer, options: ConnectionOptions = {}, authentication = authentications[0], message = /^Server did not negotiate encryption, but the 'encrypt' config option is set to `true`\./) {
    const { connection, socket, result } = await connect(options, authentication);
    const io = new MessageIO(socket, 4096, new Debug());
    const request = await readPrelogin(io, options.encrypt === false ? 0x02 : 0x01);
    assertNoCredentials(request);

    const received: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => {
      received.push(chunk);
      // Stop a vulnerable client immediately rather than waiting for its login timeout.
      socket.destroy();
    });
    const closed = once(socket, 'close');
    io.sendMessage(TYPE.RESPONSE, response);

    const [error] = await Promise.all([result, closed]);
    const data = Buffer.concat(received);
    assertNoCredentials(data);
    assert.lengthOf(data, 0, 'no LOGIN7, TLS handshake or other data after rejected PRELOGIN');
    assert.instanceOf(error, ConnectionError);
    assert.strictEqual((error as ConnectionError).code, 'EENCRYPT');
    assert.match(error!.message, message);
    assert.isTrue(connection.closed);
    assert.strictEqual(connection.curTransientRetryCount, 0);
    assert.lengthOf(sockets, 1, 'must not retry without encryption');
  }

  // MS-TDS 2.2.6.5: an ENCRYPT_ON client must terminate unless ON or REQ is returned.
  for (const [name, response] of [
    ['OFF', preloginResponse(0x00)],
    ['NOT_SUP', preloginResponse(0x02)],
    ['omitted ENCRYPTION', preloginResponse()],
    ['unknown ENCRYPTION', preloginResponse(0x04)]
  ] as const) {
    for (const authentication of authentications) {
      for (const trustServerCertificate of [false, true]) {
        it(`rejects ${name} without sending ${authentication.type} credentials (trustServerCertificate=${trustServerCertificate})`, async function() {
          await assertRejected(response, { encrypt: true, trustServerCertificate }, authentication);
        });
      }
    }

    it(`rejects ${name} with the default encryption setting`, async function() {
      await assertRejected(response, {});
    });
  }

  // ENCRYPT_EXT is reserved; ENCRYPT_CLIENT_CERT is a client request, not a server response.
  for (const encryption of [0x20, 0x21, 0x23, 0x80, 0x81, 0x82, 0x83, 0xFF]) {
    it(`rejects unsupported server ENCRYPTION=0x${encryption.toString(16)} without masking flag bits`, async function() {
      await assertRejected(preloginResponse(encryption), { encrypt: true });
    });
  }

  for (const [name, response] of [
    ['zero length', (() => { const data = preloginResponse(1); data.writeUInt16BE(0, 8); return data; })()],
    ['excess length', (() => { const data = preloginResponse(1); data.writeUInt16BE(2, 8); return data; })()],
    ['out-of-bounds offset', (() => { const data = preloginResponse(1); data.writeUInt16BE(data.length, 6); return data; })()],
    ['option-table offset', (() => { const data = preloginResponse(1); data.writeUInt16BE(5, 6); return data; })()],
    ['duplicate OFF/ON', preloginResponse(0, 1)],
    ['duplicate ON/OFF', preloginResponse(1, 0)],
    ['duplicate ON/ON', preloginResponse(1, 1)]
  ] as const) {
    it(`rejects malformed ENCRYPTION (${name}) without sending LOGIN7`, async function() {
      await assertRejected(response, { encrypt: true }, authentications[0], /^(Malformed|Duplicate) ENCRYPTION option in PRELOGIN response$/);
    });
  }

  for (const encryption of [0x01, 0x03]) {
    it(`preserves the server-requires-encryption error for encrypt=false and ENCRYPTION=${encryption}`, async function() {
      await assertRejected(preloginResponse(encryption), { encrypt: false }, authentications[0], /^Server requires encryption, set 'encrypt' config option to `true`\.$/);
    });
  }

  async function startServerTls(socket: net.Socket, io: MessageIO): Promise<MessageIO> {
    const duplexpair = new DuplexPair();
    const pair = {
      cleartext: new TLSSocket(duplexpair.socket1 as net.Socket, {
        isServer: true,
        key,
        cert: certificate,
        maxVersion: 'TLSv1.2'
      }),
      encrypted: duplexpair.socket2
    };
    securePairs.push(pair);
    const secure = once(pair.cleartext, 'secure');
    // As in the MessageIO tests, TLS 1.2 completes in two PRELOGIN exchanges.
    for (let i = 0; i < 2; i++) {
      pair.encrypted.write(await readMessage(io, TYPE.PRELOGIN));
      await once(pair.encrypted, 'readable');
      const chunks: Buffer[] = [];
      let chunk;
      while (chunk = pair.encrypted.read()) {
        chunks.push(chunk);
      }
      await once(io.sendMessage(TYPE.PRELOGIN, Buffer.concat(chunks)), 'end');
    }
    socket.unpipe();
    io.outgoingMessageStream.unpipe(socket);
    socket.pipe(pair.encrypted);
    pair.encrypted.pipe(socket);
    const encryptedIo = new MessageIO(pair.cleartext, 4096, new Debug());
    await secure;
    return encryptedIo;
  }

  async function finishLogin(io: MessageIO) {
    const data = await readMessage(io, TYPE.LOGIN7);
    assert.isTrue(data.includes(Buffer.from(userName, 'ucs2')));
    io.sendMessage(TYPE.RESPONSE, loginAck());
    await readMessage(io, TYPE.SQL_BATCH);
    io.sendMessage(TYPE.RESPONSE, Buffer.alloc(0));
  }

  for (const encryption of [0x01, 0x03]) {
    for (const trustServerCertificate of [false, true]) {
      it(`completes TLS before LOGIN7 for ENCRYPTION=${encryption} (trustServerCertificate=${trustServerCertificate})`, async function() {
        const { connection, socket, result } = await connect({
          encrypt: true,
          trustServerCertificate,
          cryptoCredentialsDetails: trustServerCertificate ? {} : { ca: [certificate] }
        });
        const io = new MessageIO(socket, 4096, new Debug());
        await readPrelogin(io);
        const received: Buffer[] = [];
        socket.on('data', (chunk: Buffer) => { received.push(chunk); });
        io.sendMessage(TYPE.RESPONSE, preloginResponse(encryption));

        const encryptedIo = await startServerTls(socket, io);
        await finishLogin(encryptedIo);
        assert.isUndefined(await result);
        assert.isTrue(connection.messageIo.tlsNegotiationComplete);
        assert.strictEqual(connection.messageIo.securePair!.cleartext.authorized, !trustServerCertificate);
        assertNoCredentials(Buffer.concat(received));
      });
    }
  }

  const certificateFailures: { name: string, options: ConnectionOptions, message: RegExp }[] = [
    { name: 'untrusted certificate', options: {}, message: /self[- ]signed certificate/i },
    {
      name: 'hostname mismatch',
      options: { serverName: 'not-loopback.invalid', cryptoCredentialsDetails: { ca: [certificate] } },
      message: /Hostname\/IP does not match certificate/
    }
  ];
  for (const { name, options, message } of certificateFailures) {
    it(`does not send LOGIN7 after certificate validation fails (${name})`, async function() {
      const { connection, socket, result } = await connect({ encrypt: true, ...options });
      const io = new MessageIO(socket, 4096, new Debug());
      await readPrelogin(io);
      const received: Buffer[] = [];
      socket.on('data', (chunk: Buffer) => { received.push(chunk); });
      const closed = once(socket, 'close');
      io.sendMessage(TYPE.RESPONSE, preloginResponse(1));

      const encryptedIo = await startServerTls(socket, io);
      const [error, , next] = await Promise.all([result, closed, encryptedIo.incomingMessageIterator.next()]);
      assert.instanceOf(error, ConnectionError);
      assert.match(error!.message, message);
      assert.isFalse(connection.messageIo.tlsNegotiationComplete);
      assert.isTrue(connection.closed);
      assertNoCredentials(Buffer.concat(received));
      assert.isTrue(next.done, 'no LOGIN7 after certificate validation fails');
      assert.lengthOf(sockets, 1);
    });
  }

  it('preserves encrypt=false with ENCRYPT_NOT_SUP', async function() {
    const { socket, result } = await connect({ encrypt: false });
    const io = new MessageIO(socket, 4096, new Debug());
    await readPrelogin(io, 0x02);
    io.sendMessage(TYPE.RESPONSE, preloginResponse(2));
    await finishLogin(io);
    assert.isUndefined(await result);
  });

  // These are legacy compatibility cases, not valid responses to ENCRYPT_NOT_SUP in the spec matrix.
  for (const [name, response] of [
    ['OFF', preloginResponse(0)],
    ['omitted ENCRYPTION', preloginResponse()],
    ['unknown ENCRYPTION', preloginResponse(4)]
  ] as const) {
    it(`preserves encrypt=false compatibility with unexpected ${name}`, async function() {
      const { socket, result } = await connect({ encrypt: false });
      const io = new MessageIO(socket, 4096, new Debug());
      await readPrelogin(io, 0x02);
      io.sendMessage(TYPE.RESPONSE, response);
      await finishLogin(io);
      assert.isUndefined(await result);
    });
  }

  for (const [name, response] of [
    ['ON', preloginResponse(1)],
    ['REQ', preloginResponse(3)],
    ['OFF', preloginResponse(0)],
    ['NOT_SUP', preloginResponse(2)],
    ['omitted ENCRYPTION', preloginResponse()],
    ['reserved ENCRYPTION value', preloginResponse(0x20)]
  ] as const) {
    it(`keeps strict mode encrypted with ${name}`, async function() {
      const { connection, socket, result } = await connect({
        encrypt: 'strict',
        cryptoCredentialsDetails: { ca: [certificate] }
      });
      const secureSocket = new TLSSocket(socket, {
        isServer: true, key, cert: certificate, ALPNProtocols: ['tds/8.0']
      });
      sockets.push(secureSocket);
      const io = new MessageIO(secureSocket, 4096, new Debug());
      await readPrelogin(io, 0x02);
      assert.strictEqual(secureSocket.alpnProtocol, 'tds/8.0');
      io.sendMessage(TYPE.RESPONSE, response);
      await finishLogin(io);
      assert.isUndefined(await result);
      assert.instanceOf(connection.socket, TLSSocket);
      assert.isTrue((connection.socket as TLSSocket).authorized);
      assert.isFalse(connection.messageIo.tlsNegotiationComplete);
    });
  }

  for (const reconnect of ['routing', 'retry']) {
    it(`rejects a downgrade on ${reconnect}`, async function() {
      const { connection, socket, result } = await connect({
        encrypt: true,
        cryptoCredentialsDetails: { ca: [certificate] }
      });
      const io = new MessageIO(socket, 4096, new Debug());
      await readPrelogin(io);
      io.sendMessage(TYPE.RESPONSE, preloginResponse(1));
      const encryptedIo = await startServerTls(socket, io);
      await readMessage(encryptedIo, TYPE.LOGIN7);

      let response: Buffer;
      if (reconnect === 'routing') {
        const address = server.address() as net.AddressInfo;
        const routingValue = new WritableTrackingBuffer();
        routingValue.writeUInt8(0);
        routingValue.writeUInt16LE(address.port);
        routingValue.writeUsVarchar(address.address, 'ucs2');
        const routingData = new WritableTrackingBuffer();
        routingData.writeUInt8(20);
        routingData.writeUsVarbyte(routingValue.data);
        routingData.writeUsVarbyte(Buffer.alloc(0));
        const routingToken = new WritableTrackingBuffer();
        routingToken.writeUInt8(0xE3);
        routingToken.writeUsVarbyte(routingData.data);
        response = Buffer.concat([loginAck(), routingToken.data]);
      } else {
        const error = new WritableTrackingBuffer();
        error.writeUInt32LE(4060); // Transient login failure
        error.writeUInt8(1); // State
        error.writeUInt8(14); // Class
        error.writeUsVarchar('Failure', 'ucs2');
        error.writeBVarchar('', 'ucs2'); // Server name
        error.writeBVarchar('', 'ucs2'); // Procedure name
        error.writeUInt32LE(0); // Line number
        const errorToken = new WritableTrackingBuffer();
        errorToken.writeUInt8(0xAA);
        errorToken.writeUsVarbyte(error.data);
        response = errorToken.data;
      }

      const accepted = new Promise<net.Socket>((resolve) => { server.once('connection', resolve); });
      encryptedIo.sendMessage(TYPE.RESPONSE, response);
      const target = await accepted;
      const targetIo = new MessageIO(target, 4096, new Debug());
      await readPrelogin(targetIo);
      const received: Buffer[] = [];
      target.on('data', (chunk: Buffer) => { received.push(chunk); target.destroy(); });
      const closed = once(target, 'close');
      targetIo.sendMessage(TYPE.RESPONSE, preloginResponse());
      const [error] = await Promise.all([result, closed]);
      assertNoCredentials(Buffer.concat(received));
      assert.lengthOf(received, 0);
      assert.instanceOf(error, ConnectionError);
      assert.strictEqual((error as ConnectionError).code, 'EENCRYPT');
      assert.isTrue(connection.closed);
      assert.strictEqual(connection.curTransientRetryCount, reconnect === 'retry' ? 1 : 0);
      assert.lengthOf(sockets, 2);
    });
  }
});
