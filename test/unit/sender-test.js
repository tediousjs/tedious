const dgram = require('dgram');
const { assert } = require('chai');
const dns = require('dns');
const AbortController = require('node-abort-controller');

const { Sender } = require('../../src/sender');

describe('Sender', function() {
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

    it('uses the given lookup function to resolve host names', function(done) {
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
      const sender = new Sender('foo.bar.baz', port, lookup, controller.signal, Buffer.from([0x02]));
      sender.execute(done);
    });

    it('forwards any errors happening during lookup', function(done) {
      const expectedError = new Error('fail');

      function lookup(hostname, options, callback) {
        process.nextTick(callback, expectedError);
      }

      server.once('message', (message, rinfo) => {
        server.send(Buffer.from('response'), rinfo.port, rinfo.address);
      });

      const controller = new AbortController();
      const sender = new Sender('foo.bar.baz', port, lookup, controller.signal, Buffer.from([0x02]));
      sender.execute((err) => {
        assert.strictEqual(err, expectedError);

        done();
      });
    });

    it('sends the given request to the remote server', function(done) {
      const expectedRequest = Buffer.from([0x02]);

      server.once('message', (message, rinfo) => {
        assert.deepEqual(message, Buffer.from([0x02]));

        server.send(Buffer.from('response'), rinfo.port, rinfo.address);
      });

      const controller = new AbortController();
      const sender = new Sender(address, port, dns.lookup, controller.signal, expectedRequest);
      sender.execute(done);
    });

    it('calls the given callback with the received response', function(done) {
      const expectedResponse = Buffer.from('response');

      server.once('message', (message, rinfo) => {
        server.send(expectedResponse, rinfo.port, rinfo.address);
      });

      const controller = new AbortController();
      const sender = new Sender(address, port, dns.lookup, controller.signal, Buffer.from([0x02]));
      sender.execute((err, message) => {
        if (err) {
          return done(err);
        }

        assert.deepEqual(message, expectedResponse);

        done();
      });
    });

    it('can be aborted during the DNS lookup', function(done) {
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
      const sender = new Sender('foo.bar.baz', port, lookup, controller.signal, Buffer.from([0x02]));
      sender.execute((err) => {
        assert.instanceOf(err, Error);
        assert.strictEqual(err.name, 'AbortError');

        done();
      });
    });

    it('can be aborted after the DNS lookup', function(done) {
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
      const sender = new Sender('foo.bar.baz', port, lookup, controller.signal, Buffer.from([0x02]));
      sender.execute((err) => {
        assert.instanceOf(err, Error);
        assert.strictEqual(err.name, 'AbortError');

        done();
      });
    });

    it('can be aborted before receiving a response', function(done) {
      const expectedRequest = Buffer.from([0x02]);

      server.once('message', (message, rinfo) => {
        controller.abort();
      });

      const controller = new AbortController();
      const sender = new Sender(address, port, dns.lookup, controller.signal, expectedRequest);
      sender.execute((err) => {
        assert.instanceOf(err, Error);
        assert.strictEqual(err.name, 'AbortError');

        done();
      });
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

    it('uses the given lookup function to resolve host names', function(done) {
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
      const sender = new Sender('foo.bar.baz', port, lookup, controller.signal, Buffer.from([0x02]));
      sender.execute(done);
    });

    it('forwards any errors happening during lookup', function(done) {
      const expectedError = new Error('fail');

      function lookup(hostname, options, callback) {
        process.nextTick(callback, expectedError);
      }

      server.once('message', (message, rinfo) => {
        server.send(Buffer.from('response'), rinfo.port, rinfo.address);
      });

      const controller = new AbortController();
      const sender = new Sender('foo.bar.baz', port, lookup, controller.signal, Buffer.from([0x02]));
      sender.execute((err) => {
        assert.strictEqual(err, expectedError);

        done();
      });
    });

    it('sends the given request to the remote server', function(done) {
      const expectedRequest = Buffer.from([0x02]);

      server.once('message', (message, rinfo) => {
        assert.deepEqual(message, Buffer.from([0x02]));

        server.send(Buffer.from('response'), rinfo.port, rinfo.address);
      });

      const controller = new AbortController();
      const sender = new Sender(address, port, dns.lookup, controller.signal, expectedRequest);
      sender.execute(done);
    });

    it('calls the given callback with the received response', function(done) {
      const expectedResponse = Buffer.from('response');

      server.once('message', (message, rinfo) => {
        server.send(expectedResponse, rinfo.port, rinfo.address);
      });

      const controller = new AbortController();
      const sender = new Sender(address, port, dns.lookup, controller.signal, Buffer.from([0x02]));
      sender.execute((err, message) => {
        if (err) {
          return done(err);
        }

        assert.deepEqual(message, expectedResponse);

        done();
      });
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

    it('sends the request to all servers', function(done) {
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
      const sender = new Sender('foo.bar.baz', port, lookup, controller.signal, expectedRequest);
      sender.execute((err) => {
        if (err) {
          return done(err);
        }

        assert.deepEqual([
          [ '127.0.0.1', expectedRequest ],
          [ '127.0.0.2', expectedRequest ],
          [ '127.0.0.3', expectedRequest ]
        ], messages);

        done();
      });
    });

    it('calls the given callback with the first received response', function(done) {
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
      const sender = new Sender('foo.bar.baz', port, lookup, controller.signal, expectedRequest);
      sender.execute((err, response) => {
        if (err) {
          return done(err);
        }

        assert.strictEqual(messages.length, 3);
        assert.deepEqual(response, Buffer.from('response #3'));

        done();
      });
    });
  });
});
