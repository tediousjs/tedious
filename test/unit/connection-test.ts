import * as net from 'net';
import * as tls from 'tls';
import { readFileSync } from 'fs';
import * as sinon from 'sinon';
import { Connection, ConnectionError } from '../../src/tedious';
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
