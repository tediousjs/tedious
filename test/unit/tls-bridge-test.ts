import { assert } from 'chai';
import { once } from 'events';
import { type Socket } from 'net';
import { type Duplex, duplexPair } from 'stream';

import { TlsBridge } from '../../src/tls-bridge';

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('TlsBridge', function() {
  // The bridge's socket, and the server end of the connection.
  let socket: Duplex;
  let server: Duplex;

  beforeEach(function() {
    [socket, server] = duplexPair();
  });

  afterEach(function() {
    socket.destroy();
    server.destroy();
  });

  describe('during the handshake', function() {
    it('exchanges the data written in one go as one message, and hands back the response', async function() {
      const exchanged: Buffer[] = [];
      const bridge = new TlsBridge(socket as Socket, async (data) => {
        exchanged.push(data);
        return Buffer.from('response');
      });

      bridge.write(Buffer.from('hello, '));
      bridge.write(Buffer.from('server'));

      const [response] = await once(bridge, 'data');

      assert.deepEqual(exchanged, [Buffer.from('hello, server')]);
      assert.deepEqual(response, Buffer.from('response'));

      bridge.destroy();
    });

    it('exchanges the data written while waiting for a response once the response arrived', async function() {
      const exchanged: Buffer[] = [];
      const responses: Array<(response: Buffer) => void> = [];
      const bridge = new TlsBridge(socket as Socket, (data) => {
        exchanged.push(data);
        return new Promise((resolve) => responses.push(resolve));
      });

      const received: Buffer[] = [];
      bridge.on('data', (data) => received.push(data));

      bridge.write(Buffer.from('first'));
      await nextTick();

      bridge.write(Buffer.from('second'));
      await nextTick();

      assert.deepEqual(exchanged, [Buffer.from('first')]);

      responses[0](Buffer.from('first response'));
      await nextTick();

      assert.deepEqual(exchanged, [Buffer.from('first'), Buffer.from('second')]);
      assert.deepEqual(received, [Buffer.from('first response')]);

      responses[1](Buffer.from('second response'));
      await nextTick();

      assert.deepEqual(received, [Buffer.from('first response'), Buffer.from('second response')]);

      bridge.destroy();
    });

    it('fails if the exchange fails', async function() {
      const error = new Error('exchange failed');
      const bridge = new TlsBridge(socket as Socket, () => Promise.reject(error));

      bridge.write(Buffer.from('data'));

      const [emitted] = await once(bridge, 'error').catch((err) => [err]);
      assert.strictEqual(emitted, error);
      assert.isTrue(bridge.destroyed);
    });

    it('does not touch the socket', async function() {
      const bridge = new TlsBridge(socket as Socket, async () => Buffer.from('response'));

      const received: Buffer[] = [];
      bridge.on('data', (data) => received.push(data));

      server.write(Buffer.from('not handshake data'));
      await nextTick();

      assert.deepEqual(received, []);

      bridge.destroy();
    });
  });

  describe('after the handshake', function() {
    let bridge: TlsBridge;

    beforeEach(function() {
      bridge = new TlsBridge(socket as Socket, () => {
        throw new Error('unexpected exchange');
      });
      bridge.startPassthrough();
    });

    afterEach(function() {
      bridge.destroy();
    });

    it('passes data between the TLS layer and the socket as is', async function() {
      bridge.write(Buffer.from('to server'));
      const [toServer] = await once(server, 'data');
      assert.deepEqual(toServer, Buffer.from('to server'));

      server.write(Buffer.from('from server'));
      const [fromServer] = await once(bridge, 'data');
      assert.deepEqual(fromServer, Buffer.from('from server'));
    });

    it('stops reading from the socket while the TLS layer does not read', async function() {
      // Nobody reads from the bridge.
      for (let i = 0; i < 16; i++) {
        server.write(Buffer.alloc(4096));
      }
      await nextTick();

      assert.isTrue(socket.isPaused());

      const received: Buffer[] = [];
      bridge.on('data', (data) => received.push(data));
      await nextTick();

      assert.isFalse(socket.isPaused());
      assert.strictEqual(Buffer.concat(received).length, 16 * 4096);
    });

    it('stops taking in data from the TLS layer while the socket does not drain', async function() {
      server.pause();

      let written = 0;
      while (bridge.write(Buffer.alloc(4096))) {
        written += 4096;
        assert.isBelow(written, 1024 * 1024, 'the bridge never applied backpressure');
      }
      await nextTick();

      // The socket buffered some of the data, and the bridge holds the rest.
      assert.isAbove(bridge.writableLength, 0);

      const received: Buffer[] = [];
      server.on('data', (data) => received.push(data));
      server.resume();
      await once(bridge, 'drain');

      assert.strictEqual(bridge.writableLength, 0);
    });

    it('passes on the end of the data from the socket', async function() {
      bridge.resume();
      server.end();

      await once(bridge, 'end');
    });

    it('closes once the socket closed, even with a write waiting for the socket to drain', async function() {
      server.pause();
      while (bridge.write(Buffer.alloc(4096))) {
        // Fill the buffers.
      }

      socket.destroy();

      await once(bridge, 'close');
    });
  });

  it('closes right away if the socket closed before the handshake completed', async function() {
    const bridge = new TlsBridge(socket as Socket, async () => Buffer.alloc(0));

    socket.destroy();
    await nextTick();

    bridge.startPassthrough();
    await once(bridge, 'close');
  });
});
