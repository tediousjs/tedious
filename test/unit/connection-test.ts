import * as net from 'net';
import * as tls from 'tls';
import { readFileSync } from 'fs';
import * as sinon from 'sinon';
import { Connection, ConnectionError, RequestError } from '../../src/tedious';
import { type ConnectionConfiguration } from '../../src/connection';
import { TYPES, type DataType } from '../../src/data-type';
import { Login7TokenHandler } from '../../src/token/handler';
import { FeatureExtAckToken } from '../../src/token/token';
import { assert } from 'chai';

describe('Using `strict` encryption', function() {
  let server: net.Server;

  beforeEach(function(done) {
    server = net.createServer();
    server.listen(0, '127.0.0.1', done);
  });

  afterEach(function(done) {
    server.close(done);
  });

  it('does not throw an unhandled exception if the tls handshake fails', function(done) {
    server.on('connection', (connection) => {
      console.log('incoming connection');

      connection.on('data', () => {
        // Ignore all incoming data
      });

      setTimeout(() => {
        connection.end();
      }, 50);
    });

    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: 'strict'
      }
    });

    connection.connect((err) => {
      assert.instanceOf(err, Error);
      assert.include(err!.message, 'Client network socket disconnected before secure TLS connection was established');

      done();
    });
  });

  it('handles connection timeout when performing tls handshake', function(done) {
    server.on('connection', (connection) => {
      setTimeout(() => {
        connection.destroy();
      }, 4000);
    });

    const addressInfo = server.address() as net.AddressInfo;

    const connection = new Connection({
      server: addressInfo?.address,
      options: {
        port: addressInfo?.port,
        encrypt: 'strict',
        connectTimeout: 3000
      }
    });

    connection.connect((err) => {
      assert.instanceOf(err, ConnectionError);

      const message = `Failed to connect to ${addressInfo?.address}:${addressInfo?.port} in 3000ms`;
      assert.equal(err!.message, message);

      connection.close();
    });

    connection.on('end', () => {
      done();
    });
  });

  it('caps the TLS max send fragment size to the configured packet size', function(done) {
    // Regression test for https://github.com/tediousjs/tedious/issues/1182.
    //
    // `wrapWithTls` (used only for `encrypt: "strict"`, i.e. TDS 8.0) must cap the TLS
    // max send fragment size to the TDS packet size, the same way the classic
    // `MessageIO#startTls` path already does. Without it, Node's TLS layer is free to
    // coalesce multiple back-to-back TDS packet writes into a single, larger TLS
    // record. A LOGIN7 message that spans more than one TDS packet (e.g. any FedAuth
    // login carrying an Entra ID access token, which routinely exceeds one 4KB packet)
    // would then be sent as one oversized TLS record, which Azure SQL's TDS 8.0
    // gateway rejects by resetting the connection.
    //
    // `wrapWithTls` ignores `trustServerCertificate` (TDS 8.0 mandates real certificate
    // validation), so the fake server here uses `test/fixtures/loopback-ip.crt`, which
    // carries an `IP Address:127.0.0.1` SAN, and the client trusts it via `ca` — the
    // handshake succeeds through genuine certificate validation, not a bypass.
    //
    // `wrapWithTls` doesn't route through `MessageIO`'s `secure` event (that only fires
    // for the classic path), so there's no connection-level event to wait on here.
    // Instead of a fixed delay, react as soon as `setMaxSendFragment` is first called.
    const originalSetMaxSendFragment = tls.TLSSocket.prototype.setMaxSendFragment;
    const calls: number[] = [];
    const { promise: onCalled, resolve: resolveOnCalled } = Promise.withResolvers<void>();

    const setMaxSendFragmentStub = sinon.stub(tls.TLSSocket.prototype, 'setMaxSendFragment').callsFake(function(this: tls.TLSSocket, size: number) {
      calls.push(size);
      resolveOnCalled();
      return originalSetMaxSendFragment.call(this, size);
    });

    const serverSockets: net.Socket[] = [];

    server.on('connection', (rawSocket) => {
      serverSockets.push(rawSocket);

      // A minimal TDS 8.0 "server": complete a real TLS handshake advertising the
      // `tds/8.0` ALPN protocol (as `wrapWithTls` requires), then go silent. We only
      // care about what the client does immediately after the handshake completes.
      const tlsSocket = new tls.TLSSocket(rawSocket, {
        isServer: true,
        key: readFileSync('./test/fixtures/loopback-ip.key'),
        cert: readFileSync('./test/fixtures/loopback-ip.crt'),
        ALPNProtocols: ['tds/8.0']
      });

      // Ignore any post-handshake errors (the fake server never responds to PRELOGIN).
      tlsSocket.on('error', () => {});
    });

    const addressInfo = server.address() as net.AddressInfo;

    const connection = new Connection({
      server: addressInfo.address,
      options: {
        port: addressInfo.port,
        encrypt: 'strict',
        cryptoCredentialsDetails: {
          ca: [readFileSync('./test/fixtures/loopback-ip.crt')]
        },
        packetSize: 2048,
        connectTimeout: 3000
      }
    });

    let finished = false;
    const finish = (err?: Error) => {
      if (finished) {
        return;
      }
      finished = true;

      setMaxSendFragmentStub.restore();
      connection.close();
      for (const socket of serverSockets) {
        socket.destroy();
      }

      done(err);
    };

    // The fake server never completes PRELOGIN/LOGIN7, so the connection would time out
    // eventually — that's fine, we only need to observe what happens right after the
    // TLS handshake, which is what `setMaxSendFragment` is called for. If the handshake
    // itself breaks, the connect callback reports the error, failing fast instead of
    // hanging until the mocha timeout. (`finish` ignores the late timeout error that
    // this callback reports after a successful run tears the connection down.)
    connection.connect(finish);

    onCalled.then(() => {
      try {
        assert.deepEqual(
          calls, [2048],
          `expected setMaxSendFragment to be called with 2048, got calls: ${JSON.stringify(calls)}`
        );
      } catch (err: any) {
        return finish(err);
      }

      finish();
    });
  });
});

describe('Vector support negotiation', function() {
  const float16: Array<{ type: DataType, baseType: 'float32' | 'float16' }> = [{ type: TYPES.Vector, baseType: 'float16' }];
  const float32: Array<{ type: DataType, baseType: 'float32' | 'float16' }> = [{ type: TYPES.Vector, baseType: 'float32' }];

  function createConnection(options: { vectorTypeSupport?: 'off' | 'v1' | 'v2', tdsVersion?: string } = {}, authentication?: ConnectionConfiguration['authentication']) {
    return new Connection(authentication ? { server: 'localhost', authentication, options: { ...options } } : { server: 'localhost', options: { ...options } });
  }

  // Runs `fn` as if this version of Node.js had no `Float16Array`.
  function withoutFloat16Array(fn: () => void) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Float16Array');
    Object.defineProperty(globalThis, 'Float16Array', { value: undefined, configurable: true, writable: true });
    try {
      fn();
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'Float16Array', descriptor);
      } else {
        delete (globalThis as { Float16Array?: unknown }).Float16Array;
      }
    }
  }

  function acknowledge(connection: Connection, requested: number, token: FeatureExtAckToken) {
    connection.loginVectorSupportVersion = requested;
    const handler = new Login7TokenHandler(connection);
    handler.loginAckReceived = true;
    handler.onFeatureExtAck(token);
    return handler;
  }

  describe('#requestedVectorSupportVersion', function() {
    it('requests the version selected with `vectorTypeSupport`', function() {
      assert.strictEqual(createConnection().requestedVectorSupportVersion(), 0);
      assert.strictEqual(createConnection({ vectorTypeSupport: 'off' }).requestedVectorSupportVersion(), 0);
      assert.strictEqual(createConnection({ vectorTypeSupport: 'v1' }).requestedVectorSupportVersion(), 1);
    });

    it('requests version 2 only where `Float16Array` exists', function() {
      const connection = createConnection({ vectorTypeSupport: 'v2' });
      if ((globalThis as { Float16Array?: unknown }).Float16Array) {
        assert.strictEqual(connection.requestedVectorSupportVersion(), 2);
      }

      withoutFloat16Array(() => {
        assert.strictEqual(connection.requestedVectorSupportVersion(), 1);
      });
    });

    it('requests no vector support before TDS 7.4', function() {
      assert.strictEqual(createConnection({ vectorTypeSupport: 'v2', tdsVersion: '7_3_B' }).requestedVectorSupportVersion(), 0);
    });
  });

  describe('Login7TokenHandler#onFeatureExtAck', function() {
    it('accepts a version up to the requested one', function() {
      for (const version of [1, 2]) {
        const connection = createConnection({ vectorTypeSupport: 'v2' });
        const handler = acknowledge(connection, 2, new FeatureExtAckToken(undefined, true, Buffer.from([version])));

        assert.isUndefined(handler.loginError);
        assert.isTrue(handler.loginAckReceived);
        assert.strictEqual(connection.vectorSupportVersion, version);
      }
    });

    it('rejects invalid acknowledgements', function() {
      for (const [requested, data] of [
        [0, [1]], // not requested
        [1, [2]], // a higher version than requested
        [2, [0]], // version 0
        [2, []], // no data
        [2, [1, 1]] // more than one byte
      ] as const) {
        const connection = createConnection({ vectorTypeSupport: 'v2' });
        const handler = acknowledge(connection, requested, new FeatureExtAckToken(undefined, undefined, Buffer.from(data)));

        assert.instanceOf(handler.loginError, ConnectionError);
        assert.strictEqual(handler.loginError!.code, 'EVECTORSUPPORT');
        assert.isFalse(handler.loginAckReceived);
        assert.strictEqual(connection.vectorSupportVersion, 0);
      }
    });

    it('checks the version sent at login, not the TDS version acknowledged by the server', function() {
      const connection = createConnection({ vectorTypeSupport: 'v2', tdsVersion: '7_3_B' });
      const handler = acknowledge(connection, 1, new FeatureExtAckToken(undefined, undefined, Buffer.from([1])));

      assert.isUndefined(handler.loginError);
      assert.strictEqual(connection.vectorSupportVersion, 1);
    });

    it('is combined with the federated authentication acknowledgement', function() {
      const authentication = { type: 'azure-active-directory-access-token' as const, options: { token: 'token' } };

      let connection = createConnection({ vectorTypeSupport: 'v2' }, authentication);
      let handler = acknowledge(connection, 2, new FeatureExtAckToken(Buffer.alloc(0), undefined, Buffer.from([2])));
      assert.isUndefined(handler.loginError);
      assert.strictEqual(connection.vectorSupportVersion, 2);

      connection = createConnection({ vectorTypeSupport: 'v2' }, authentication);
      handler = acknowledge(connection, 2, new FeatureExtAckToken(undefined, undefined, Buffer.from([2])));
      assert.strictEqual(handler.loginError?.message, 'Did not receive Active Directory authentication acknowledgement');

      connection = createConnection({ vectorTypeSupport: 'v2' });
      handler = acknowledge(connection, 2, new FeatureExtAckToken(Buffer.alloc(0), undefined, Buffer.from([2])));
      assert.strictEqual(handler.loginError?.message, 'Did not request Active Directory authentication, but received the acknowledgment');
    });
  });

  describe('#checkVectorSupport', function() {
    function check(options: { vectorTypeSupport?: 'off' | 'v1' | 'v2', tdsVersion?: string }, negotiated: number, types = float16) {
      const connection = createConnection(options);
      connection.vectorSupportVersion = negotiated;
      return connection.checkVectorSupport(types);
    }

    it('accepts types the negotiated version supports', function() {
      assert.isUndefined(check({}, 0, [{ type: TYPES.Int, baseType: undefined }] as any));
      assert.isUndefined(check({ vectorTypeSupport: 'v1' }, 1, float32));
      assert.isUndefined(check({ vectorTypeSupport: 'v2' }, 2, float16));
    });

    it('explains why vector support is missing', function() {
      for (const [options, negotiated, types, message] of [
        [{ vectorTypeSupport: 'v2', tdsVersion: '7_3_B' }, 0, float32, 'is lower than `7_4`'],
        [{ vectorTypeSupport: 'off' }, 0, float32, 'Set the `vectorTypeSupport` connection option to `\'v1\'` or `\'v2\'` to use `TYPES.Vector`.'],
        [{ vectorTypeSupport: 'v1' }, 1, float16, 'Set it to `\'v2\'` to use `float16` vectors.'],
        [{ vectorTypeSupport: 'v2' }, 0, float32, 'The server does not support the `vector` data type.']
      ] as const) {
        const error = check(options, negotiated, types as any);
        assert.instanceOf(error, RequestError);
        assert.strictEqual(error!.code, 'EVECTORNOTSUPPORTED');
        assert.include(error!.message, message);
      }
    });

    it('explains that the server does not support `float16` vectors', function() {
      // Without `Float16Array`, version 2 is never requested.
      if (!(globalThis as { Float16Array?: unknown }).Float16Array) {
        this.skip();
      }

      assert.include(check({ vectorTypeSupport: 'v2' }, 1, float16)!.message, 'The server only supports vector support version 1');
    });

    it('explains that `float16` vectors require `Float16Array`', function() {
      withoutFloat16Array(() => {
        const error = check({ vectorTypeSupport: 'v2' }, 1, float16);
        assert.include(error!.message, '`float16` vectors require Float16Array');
      });
    });
  });
});
