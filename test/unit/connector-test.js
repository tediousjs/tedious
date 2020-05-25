const Mitm = require('mitm');
const sinon = require('sinon');
const punycode = require('punycode');
const assert = require('chai').assert;

const {
  ParallelConnectionStrategy,
  SequentialConnectionStrategy,
  Connector
} = require('../../src/connector');

describe('Connector', function() {
  describe('with MultiSubnetFailover', function() {
    let mitm;

    beforeEach(function() {
      mitm = new Mitm();
      mitm.enable();
    });

    afterEach(function() {
      mitm.disable();
    });

    it('connects directly if given an IP v4 address', function(done) {
      const hostIp = '127.0.0.1';
      const localIp = '192.168.0.1';

      const connectionOptions = {
        host: hostIp,
        port: 12345,
        localAddress: localIp
      };
      const connector = new Connector(connectionOptions, true);

      let expectedSocket;

      mitm.once('connect', function(socket, options) {
        expectedSocket = socket;

        assert.deepEqual(options, {
          host: hostIp,
          port: 12345,
          localAddress: localIp,
          family: 4
        });
      });

      connector.execute(function(err, socket) {
        if (err) {
          return done(err);
        }

        assert.strictEqual(socket, expectedSocket);

        done();
      });
    });

    it('connects directly if given an IP v6 address', function(done) {
      const hostIp = '::1';
      const localIp = '2002:20:0:0:0:0:1:2';

      const connectionOptions = {
        host: hostIp,
        port: 12345,
        localAddress: localIp
      };
      const connector = new Connector(connectionOptions, true);

      let expectedSocket;

      mitm.once('connect', function(socket, options) {
        expectedSocket = socket;

        assert.deepEqual(options, {
          host: hostIp,
          port: 12345,
          localAddress: localIp,
          family: 6
        });
      });

      connector.execute(function(err, socket) {
        if (err) {
          return done(err);
        }

        assert.strictEqual(socket, expectedSocket);

        done();
      });
    });

    it('uses a parallel connection strategy', function(done) {
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

  describe('without MultiSubnetFailover', function() {
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

    it('connects directly if given an IP address', function(done) {
      const connectionOptions = {
        host: '127.0.0.1',
        port: 12345,
        localAddress: '192.168.0.1'
      };
      const connector = new Connector(connectionOptions, false);

      let expectedSocket;
      mitm.once('connect', function(socket, options) {
        expectedSocket = socket;

        assert.deepEqual(options, {
          host: '127.0.0.1',
          port: 12345,
          localAddress: '192.168.0.1',
          family: 4
        });
      });

      connector.execute(function(err, socket) {
        if (err) {
          return done(err);
        }

        assert.strictEqual(socket, expectedSocket);

        done();
      });
    });

    it('uses a sequential connection strategy', function(done) {
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

  describe('Test unicode SQL Server name', function() {
    it('test IDN Server name', function(done) {
      const lookup = sinon.spy(function lookup(hostname, options, callback) {
        callback([{ address: '127.0.0.1', family: 4 }]);
      });

      const server = '本地主机.ad';
      const connector = new Connector({ host: server, port: 12345, lookup: lookup }, true);

      connector.execute(() => {
        assert.isOk(lookup.called, 'Failed to call `lookup` function for hostname');
        assert.isOk(lookup.calledWithMatch(punycode.toASCII(server)), 'Unexpected hostname passed to `lookup`');

        done();
      });
    });

    it('test ASCII Server name', function(done) {
      const lookup = sinon.spy(function lookup(hostname, options, callback) {
        callback([{ address: '127.0.0.1', family: 4 }]);
      });

      const server = 'localhost';
      const connector = new Connector({ host: server, port: 12345, lookup: lookup }, true);

      connector.execute(() => {
        assert.isOk(lookup.called, 'Failed to call `lookup` function for hostname');
        assert.isOk(lookup.calledWithMatch(server), 'Unexpected hostname passed to `lookup`');

        done();
      });
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

  it('tries to connect to all addresses in sequence', function(done) {
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

  it('passes the first succesfully connected socket to the callback', function(done) {
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

  it('only attempts new connections until the first successful connection', function(done) {
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

  it('fails if all sequential connections fail', function(done) {
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

  it('destroys all sockets except for the first succesfully connected socket', function(done) {
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

  it('tries to connect to all addresses in parallel', function(done) {
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

  it('fails if all parallel connections fail', function(done) {
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

  it('passes the first succesfully connected socket to the callback', function(done) {
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

  it('destroys all sockets except for the first succesfully connected socket', function(done) {
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
