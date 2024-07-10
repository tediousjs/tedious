const dgram = require('dgram');
const { assert } = require('chai');
const dns = require('dns');

const { sendMessage } = require('../../src/sender');

describe('sendMessage', function() {
  describe('with a single IPv4 address', function() {
    /**
     * @type {dgram.Socket}
     */
    let server;

    /**
     * @type {string}
     */
    const address = '127.0.0.1';

    /**
     * @type {number}
     */
    let port;

    beforeEach(function(done) {
      const onError = () => {
        server = undefined;
        this.skip();
      };

      server = dgram.createSocket('udp4');
      server.on('error', onError);
      server.bind(0, address, () => {
        server.removeListener('error', onError);

        port = server.address().port;

        done();
      });
    });

    afterEach(function(done) {
      if (server) {
        server.close(done);
      } else {
        this.skip();
      }
    });

    it('uses the given lookup function to resolve host names', async function() {
      function lookup(hostname, options, callback) {
        assert.strictEqual(hostname, 'foo.bar.baz');
        assert.deepEqual(options, { all: true });

        process.nextTick(callback, undefined, [
          { address: address, family: 4 }
        ]);
      }

      server.once('message', (message, rinfo) => {
        server.send(Buffer.from('response'), rinfo.port, rinfo.address);
      });

      const controller = new AbortController();
      await sendMessage('foo.bar.baz', port, lookup, controller.signal, Buffer.from([0x02]));
    });

    it('forwards any errors happening during lookup', async function() {
      const expectedError = new Error('fail');

      function lookup(hostname, options, callback) {
        process.nextTick(callback, expectedError);
      }

      server.once('message', (message, rinfo) => {
        server.send(Buffer.from('response'), rinfo.port, rinfo.address);
      });

      const controller = new AbortController();

      let error;
      try {
        await sendMessage('foo.bar.baz', port, lookup, controller.signal, Buffer.from([0x02]));
      } catch (err) {
        error = err;
      }

      assert.strictEqual(error, expectedError);
    });

    it('sends the given request to the remote server', async function() {
      const expectedRequest = Buffer.from([0x02]);

      server.once('message', (message, rinfo) => {
        assert.deepEqual(message, Buffer.from([0x02]));

        server.send(Buffer.from('response'), rinfo.port, rinfo.address);
      });

      const controller = new AbortController();
      await sendMessage(address, port, dns.lookup, controller.signal, expectedRequest);
    });

    it('calls the given callback with the received response', async function() {
      const expectedResponse = Buffer.from('response');

      server.once('message', (message, rinfo) => {
        server.send(expectedResponse, rinfo.port, rinfo.address);
      });

      const controller = new AbortController();

      const message = await sendMessage(address, port, dns.lookup, controller.signal, Buffer.from([0x02]));
      assert.deepEqual(message, expectedResponse);
    });

    it('can be aborted during the DNS lookup', async function() {
      function lookup(hostname, options, callback) {
        controller.abort();

        callback(undefined, [
          { address: address, family: 4 }
        ]);
      }

      server.once('message', (message, rinfo) => {
        server.send(Buffer.from('response'), rinfo.port, rinfo.address);
      });

      const controller = new AbortController();

      let error;
      try {
        await sendMessage('foo.bar.baz', port, lookup, controller.signal, Buffer.from([0x02]));
      } catch (err) {
        error = err;
      }

      assert.instanceOf(error, Error);
      assert.strictEqual(error.name, 'AbortError');
    });

    it('can be aborted after the DNS lookup', async function() {
      function lookup(hostname, options, callback) {
        process.nextTick(() => {
          controller.abort();
        });

        callback(undefined, [
          { address: address, family: 4 }
        ]);
      }

      server.once('message', (message, rinfo) => {
        server.send(Buffer.from('response'), rinfo.port, rinfo.address);
      });

      const controller = new AbortController();

      let error;
      try {
        await sendMessage('foo.bar.baz', port, lookup, controller.signal, Buffer.from([0x02]));
      } catch (err) {
        error = err;
      }

      assert.instanceOf(error, Error);
      assert.strictEqual(error.name, 'AbortError');
    });

    it('can be aborted before receiving a response', async function() {
      const expectedRequest = Buffer.from([0x02]);

      server.once('message', (message, rinfo) => {
        controller.abort();
      });

      const controller = new AbortController();

      let error;
      try {
        await sendMessage(address, port, dns.lookup, controller.signal, expectedRequest);
      } catch (err) {
        error = err;
      }

      assert.instanceOf(error, Error);
      assert.strictEqual(error.name, 'AbortError');
    });
  });

  describe('with a single IPv6 address', function() {
    /**
     * @type {dgram.Socket}
     */
    let server;

    /**
     * @type {string}
     */
    const address = '::1';

    /**
     * @type {number}
     */
    let port;

    beforeEach(function(done) {
      const onError = () => {
        server = undefined;
        this.skip();
      };

      server = dgram.createSocket('udp6');
      server.on('error', onError);
      server.bind(0, address, () => {
        server.removeListener('error', onError);

        port = server.address().port;

        done();
      });
    });

    afterEach(function(done) {
      if (server) {
        server.close(done);
      } else {
        this.skip();
      }
    });

    it('uses the given lookup function to resolve host names', async function() {
      function lookup(hostname, options, callback) {
        assert.strictEqual(hostname, 'foo.bar.baz');
        assert.deepEqual(options, { all: true });

        process.nextTick(callback, undefined, [
          { address: address, family: 6 }
        ]);
      }

      server.once('message', (message, rinfo) => {
        server.send(Buffer.from('response'), rinfo.port, rinfo.address);
      });

      const controller = new AbortController();
      await sendMessage('foo.bar.baz', port, lookup, controller.signal, Buffer.from([0x02]));
    });

    it('forwards any errors happening during lookup', async function() {
      const expectedError = new Error('fail');

      function lookup(hostname, options, callback) {
        process.nextTick(callback, expectedError);
      }

      server.once('message', (message, rinfo) => {
        server.send(Buffer.from('response'), rinfo.port, rinfo.address);
      });

      const controller = new AbortController();

      let error;
      try {
        await sendMessage('foo.bar.baz', port, lookup, controller.signal, Buffer.from([0x02]));
      } catch (err) {
        error = err;
      }

      assert.strictEqual(error, expectedError);
    });

    it('sends the given request to the remote server', async function() {
      const expectedRequest = Buffer.from([0x02]);

      server.once('message', (message, rinfo) => {
        assert.deepEqual(message, Buffer.from([0x02]));

        server.send(Buffer.from('response'), rinfo.port, rinfo.address);
      });

      const controller = new AbortController();
      await sendMessage(address, port, dns.lookup, controller.signal, expectedRequest);
    });

    it('calls the given callback with the received response', async function() {
      const expectedResponse = Buffer.from('response');

      server.once('message', (message, rinfo) => {
        server.send(expectedResponse, rinfo.port, rinfo.address);
      });

      const controller = new AbortController();
      const message = await sendMessage(address, port, dns.lookup, controller.signal, Buffer.from([0x02]));

      assert.deepEqual(message, expectedResponse);
    });
  });

  describe('with multiple addresses', function() {
    /**
     * @type {dgram.Socket[]}
     */
    let servers;

    /**
     * @type {string}
     */
    const addresses = ['127.0.0.1', '127.0.0.2', '127.0.0.3'];

    /**
     * @type {number}
     */
    let port;

    beforeEach(function() {
      servers = [];
      port = 0;
    });

    addresses.forEach((address) => {
      beforeEach(function(done) {
        const onError = () => {
          this.skip();
        };

        const server = dgram.createSocket('udp4');
        server.on('error', onError);
        server.bind(port, address, () => {
          server.removeListener('error', onError);

          port = server.address().port;
          servers.push(server);

          done();
        });
      });
    });

    afterEach(() => {
      servers.forEach((server) => {
        server.close();
      });
    });

    it('sends the request to all servers', async function() {
      function lookup(hostname, options, callback) {
        process.nextTick(callback, undefined, addresses.map((address) => {
          return { address: address, family: 4 };
        }));
      }

      const expectedRequest = Buffer.from([0x02]);

      const messages = [];

      servers.forEach((server) => {
        server.on('message', (message, rinfo) => {
          messages.push([server.address().address, message]);

          server.send(Buffer.from('response'), rinfo.port, rinfo.address);
        });
      });

      const controller = new AbortController();
      await sendMessage('foo.bar.baz', port, lookup, controller.signal, expectedRequest);

      assert.deepEqual([
        [ '127.0.0.1', expectedRequest ],
        [ '127.0.0.2', expectedRequest ],
        [ '127.0.0.3', expectedRequest ]
      ], messages);
    });

    it('calls the given callback with the first received response', async function() {
      function lookup(hostname, options, callback) {
        process.nextTick(callback, undefined, addresses.map((address) => {
          return { address: address, family: 4 };
        }));
      }

      const expectedRequest = Buffer.from([0x02]);

      const messages = [];

      servers.forEach((server) => {
        server.on('message', (message, rinfo) => {
          messages.push([server.address().address, message]);

          if (messages.length === 3) {
            server.send(Buffer.from(`response #${messages.length}`), rinfo.port, rinfo.address);
          }
        });
      });

      const controller = new AbortController();
      const response = await sendMessage('foo.bar.baz', port, lookup, controller.signal, expectedRequest);

      assert.strictEqual(messages.length, 3);
      assert.deepEqual(response, Buffer.from('response #3'));
    });
  });
});
