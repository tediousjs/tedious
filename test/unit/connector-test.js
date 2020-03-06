const Mitm = require('mitm');
const sinon = require('sinon');
const dns = require('dns');
const punycode = require('punycode');
const assert = require('chai').assert;

const ParallelConnectionStrategy = require('../../src/connector')
  .ParallelConnectionStrategy;
const SequentialConnectionStrategy = require('../../src/connector')
  .SequentialConnectionStrategy;
const Connector = require('../../src/connector').Connector;

function connectToIpTestImpl(hostIp, localIp, mitm, done) {
  const connectionOptions = {
    host: hostIp,
    port: 12345,
    localAddress: localIp
  };
  const connector = new Connector(connectionOptions, true);

  let expectedSocket;

  mitm.once('connect', function(socket, options) {
    expectedSocket = socket;

    assert.strictEqual(options, connectionOptions);
  });

  connector.execute(function(err, socket) {
    if (err) {
      return done(err);
    }

    assert.strictEqual(socket, expectedSocket);

    done();
  });
}

describe('connector tests', function() {
  describe('Connector with MultiSubnetFailover', function() {
    let mitm;

    beforeEach(function() {
      mitm = new Mitm();
      mitm.enable();
    });

    afterEach(function() {
      mitm.disable();
    });

    it('should connects directly if given an IP v4 address', function(done) {
      connectToIpTestImpl('127.0.0.1', '192.168.0.1', mitm, done);
    });

    it('should connects directly if given an IP v6 address', function(done) {
      connectToIpTestImpl('::1', '2002:20:0:0:0:0:1:2', mitm, done);
    });

    it('should uses a parallel connection strategy', function(done) {
      const connector = new Connector({ host: 'localhost', port: 12345 }, true);

      const spy = sinon.spy(ParallelConnectionStrategy.prototype, 'connect');

      connector.execute(function(err, socket) {
        if (err) {
          return done(err);
        }

        assert.strictEqual(spy.callCount, 1);

        done();
      });
    });
  });

  describe('Connector without MultiSubnetFailover', function() {
    let mitm;

    beforeEach(function() {
      mitm = new Mitm();
      mitm.enable();
    });

    afterEach(function() {
      mitm.disable();
    });

    afterEach(function() {
      sinon.restore();
    });

    it('should connect directly if given an IP address', function(done) {
      const connectionOptions = {
        host: '127.0.0.1',
        port: 12345,
        localAddress: '192.168.0.1'
      };
      const connector = new Connector(connectionOptions, false);

      let expectedSocket;
      mitm.once('connect', function(socket, options) {
        expectedSocket = socket;

        assert.strictEqual(options, connectionOptions);
      });

      connector.execute(function(err, socket) {
        if (err) {
          return done(err);
        }

        assert.strictEqual(socket, expectedSocket);

        done();
      });
    });

    it('should uses a sequential connection strategy', function(done) {
      const connector = new Connector({ host: 'localhost', port: 12345 }, false);

      const spy = sinon.spy(
        SequentialConnectionStrategy.prototype,
        'connect'
      );

      connector.execute(function(err, socket) {
        if (err) {
          return done(err);
        }

        assert.strictEqual(spy.callCount, 1);

        done();
      });
    });
  });

  describe('SequentialConnectionStrategy', function() {
    let mitm;

    beforeEach(function() {
      mitm = new Mitm();
      mitm.enable();
    });

    afterEach(function() {
      mitm.disable();
    });

    it('should tries to connect to all addresses in sequence', function(done) {
      const strategy = new SequentialConnectionStrategy(
        [
          { address: '127.0.0.2' },
          { address: '2002:20:0:0:0:0:1:3' },
          { address: '127.0.0.4' }
        ],
        { port: 12345, localAddress: '192.168.0.1' }
      );

      const attemptedConnections = [];
      mitm.on('connect', function(socket, options) {
        attemptedConnections.push(options);

        const expectedConnectionCount = attemptedConnections.length;
        const handler = () => {
          socket.removeListener('connect', handler);
          socket.removeListener('error', handler);

          assert.strictEqual(attemptedConnections.length, expectedConnectionCount);
        };

        socket.on('connect', handler);
        socket.on('error', handler);

        if (options.host !== '127.0.0.4') {
          process.nextTick(() => {
            socket.emit('error', new Error());
          });
        }
      });

      strategy.connect(function(err) {
        if (err) {
          return done(err);
        }

        assert.strictEqual(attemptedConnections.length, 3);

        assert.strictEqual(attemptedConnections[0].host, '127.0.0.2');
        assert.strictEqual(attemptedConnections[0].port, 12345);
        assert.strictEqual(attemptedConnections[0].localAddress, '192.168.0.1');

        assert.strictEqual(attemptedConnections[1].host, '2002:20:0:0:0:0:1:3');
        assert.strictEqual(attemptedConnections[1].port, 12345);
        assert.strictEqual(attemptedConnections[1].localAddress, '192.168.0.1');

        assert.strictEqual(attemptedConnections[2].host, '127.0.0.4');
        assert.strictEqual(attemptedConnections[2].port, 12345);
        assert.strictEqual(attemptedConnections[2].localAddress, '192.168.0.1');

        done();
      });
    });

    it('should passes the first succesfully connected socket to the callback', function(done) {
      const strategy = new SequentialConnectionStrategy(
        [
          { address: '127.0.0.2' },
          { address: '2002:20:0:0:0:0:1:3' },
          { address: '127.0.0.4' }
        ],
        { port: 12345, localAddress: '192.168.0.1' }
      );

      let expectedSocket;
      mitm.on('connect', function(socket, opts) {
        if (opts.host !== '127.0.0.4') {
          socket.destroy(new Error());
        } else {
          expectedSocket = socket;
        }
      });

      strategy.connect(function(err, socket) {
        assert.strictEqual(expectedSocket, socket);

        done();
      });
    });

    it('should only attempts new connections until the first successful connection', function(done) {
      const strategy = new SequentialConnectionStrategy(
        [
          { address: '127.0.0.2' },
          { address: '2002:20:0:0:0:0:1:3' },
          { address: '127.0.0.4' }
        ],
        { port: 12345, localAddress: '192.168.0.1' }
      );

      const attemptedConnections = [];

      mitm.on('connect', function(socket, options) {
        attemptedConnections.push(options);
      });

      strategy.connect(function(err) {
        if (err) {
          return done(err);
        }

        assert.strictEqual(attemptedConnections.length, 1);

        assert.strictEqual(attemptedConnections[0].host, '127.0.0.2');
        assert.strictEqual(attemptedConnections[0].port, 12345);
        assert.strictEqual(attemptedConnections[0].localAddress, '192.168.0.1');

        done();
      });
    });

    it('should fails if all sequential connections fail', function(done) {
      const strategy = new SequentialConnectionStrategy(
        [
          { address: '127.0.0.2' },
          { address: '2002:20:0:0:0:0:1:3' },
          { address: '127.0.0.4' }
        ],
        { port: 12345, localAddress: '192.168.0.1' }
      );

      mitm.on('connect', function(socket) {
        process.nextTick(() => {
          socket.emit('error', new Error());
        });
      });

      strategy.connect(function(err, socket) {
        assert.equal('Could not connect (sequence)', err.message);

        done();
      });
    });

    it('should destroys all sockets except for the first succesfully connected socket', function(done) {
      const strategy = new SequentialConnectionStrategy(
        [
          { address: '127.0.0.2' },
          { address: '2002:20:0:0:0:0:1:3' },
          { address: '127.0.0.4' }
        ],
        { port: 12345, localAddress: '192.168.0.1' }
      );

      const attemptedSockets = [];

      mitm.on('connect', function(socket, options) {
        attemptedSockets.push(socket);

        if (options.host !== '127.0.0.4') {
          process.nextTick(() => {
            socket.emit('error', new Error());
          });
        }
      });

      strategy.connect(function(err, socket) {
        if (err) {
          return done(err);
        }

        assert.isOk(attemptedSockets[0].destroyed);
        assert.isOk(attemptedSockets[1].destroyed);
        assert.isOk(!attemptedSockets[2].destroyed);

        done();
      });
    });
  });

  describe('ParallelConnectionStrategy', function() {
    let mitm;

    beforeEach(function() {
      mitm = new Mitm();
      mitm.enable();
    });

    afterEach(function() {
      mitm.disable();
    });

    it('should tries to connect to all addresses in parallel', function(done) {
      const strategy = new ParallelConnectionStrategy(
        [
          { address: '127.0.0.2' },
          { address: '2002:20:0:0:0:0:1:3' },
          { address: '127.0.0.4' }
        ],
        { port: 12345, localAddress: '192.168.0.1' }
      );

      const attemptedConnections = [];

      mitm.on('connect', function(socket, options) {
        attemptedConnections.push(options);

        socket.once('connect', function() {
          assert.strictEqual(attemptedConnections.length, 3);
        });
      });

      strategy.connect(function(err, socket) {
        if (err) {
          return done(err);
        }

        assert.strictEqual(attemptedConnections[0].host, '127.0.0.2');
        assert.strictEqual(attemptedConnections[0].port, 12345);
        assert.strictEqual(attemptedConnections[0].localAddress, '192.168.0.1');

        assert.strictEqual(attemptedConnections[1].host, '2002:20:0:0:0:0:1:3');
        assert.strictEqual(attemptedConnections[1].port, 12345);
        assert.strictEqual(attemptedConnections[1].localAddress, '192.168.0.1');

        assert.strictEqual(attemptedConnections[2].host, '127.0.0.4');
        assert.strictEqual(attemptedConnections[2].port, 12345);
        assert.strictEqual(attemptedConnections[2].localAddress, '192.168.0.1');

        done();
      });
    });

    it('should fails if all parallel connections fail', function(done) {
      const strategy = new ParallelConnectionStrategy(
        [
          { address: '127.0.0.2' },
          { address: '2002:20:0:0:0:0:1:3' },
          { address: '127.0.0.4' }
        ],
        { port: 12345, localAddress: '192.168.0.1' }
      );

      mitm.on('connect', function(socket) {
        process.nextTick(() => {
          socket.emit('error', new Error());
        });
      });

      strategy.connect(function(err, socket) {
        assert.equal('Could not connect (parallel)', err.message);

        done();
      });
    });

    it('should passes the first succesfully connected socket to the callback', function(done) {
      const strategy = new ParallelConnectionStrategy(
        [
          { address: '127.0.0.2' },
          { address: '2002:20:0:0:0:0:1:3' },
          { address: '127.0.0.4' }
        ],
        { port: 12345, localAddress: '192.168.0.1' }
      );

      let expectedSocket;
      mitm.on('connect', function(socket, opts) {
        if (opts.host !== '127.0.0.4') {
          process.nextTick(() => {
            socket.emit('error', new Error());
          });
        } else {
          expectedSocket = socket;
        }
      });

      strategy.connect(function(err, socket) {
        if (err) {
          return done(err);
        }

        assert.strictEqual(expectedSocket, socket);

        done();
      });
    });

    it('should destroys all sockets except for the first succesfully connected socket', function(done) {
      const strategy = new ParallelConnectionStrategy(
        [
          { address: '127.0.0.2' },
          { address: '2002:20:0:0:0:0:1:3' },
          { address: '127.0.0.4' }
        ],
        { port: 12345, localAddress: '192.168.0.1' }
      );

      const attemptedSockets = [];

      mitm.on('connect', function(socket) {
        attemptedSockets.push(socket);
      });

      strategy.connect(function(err, socket) {
        if (err) {
          return done(err);
        }

        assert.isOk(!attemptedSockets[0].destroyed);
        assert.isOk(attemptedSockets[1].destroyed);
        assert.isOk(attemptedSockets[2].destroyed);

        done();
      });
    });
  });

  describe('Test unicode SQL Server name', function() {
    let spy;

    beforeEach(function() {
      // Spy the dns.lookup so we can verify if it receives punycode value for IDN Server names
      spy = sinon.spy(dns, 'lookup');
    });

    afterEach(function() {
      sinon.restore();
    });

    it('should test IDN Server name', function() {
      const server = '本地主机.ad';
      const connector = new Connector({ host: server, port: 12345 }, true);

      connector.execute(() => { });

      assert.isOk(spy.called, 'Failed to call dns.lookup on hostname');
      assert.isOk(spy.calledWithMatch(punycode.toASCII(server)), 'Unexpcted hostname passed to dns.lookup');
    });

    it('should test ASCII Server name', function() {
      const server = 'localhost';
      const connector = new Connector({ host: server, port: 12345 }, true);

      connector.execute(() => { });

      assert.isOk(spy.called, 'Failed to call dns.lookup on hostname');
      assert.isOk(spy.calledWithMatch(server), 'Unexpcted hostname passed to dns.lookup');
    });
  });
});
