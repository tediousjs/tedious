'use strict';

const Mitm = require('mitm');
const sinon = require('sinon');

const ParallelConnectionStrategy = require('../../src/connector').ParallelConnectionStrategy;
const SequentialConnectionStrategy = require('../../src/connector').SequentialConnectionStrategy;
const Connector = require('../../src/connector').Connector;

const connectToIpTestImpl = function(hostIp, localIp, mitm, test) {
  const connectionOptions = {
    host: hostIp,
    port: 12345,
    localAddress: localIp
  };
  const connector = new Connector(connectionOptions, true);

  let expectedSocket;
  mitm.once('connect', function(socket, options) {
    expectedSocket = socket;

    test.strictEqual(options, connectionOptions);
  });

  connector.execute(function(err, socket) {
    test.ifError(err);

    test.strictEqual(socket, expectedSocket);

    test.done();
  });
};

exports['Connector with MultiSubnetFailover'] = {
  setUp: function(done) {
    this.mitm = new Mitm();
    this.mitm.enable();

    this.sinon = sinon.sandbox.create();

    done();
  },

  tearDown: function(done) {
    this.mitm.disable();
    this.sinon.restore();

    done();
  },

  'connects directly if given an IP v4 address': function(test) {
    connectToIpTestImpl('127.0.0.1', '192.168.0.1', this.mitm, test);
  },

  'connects directly if given an IP v6 address': function(test) {
    connectToIpTestImpl('::1', '2002:20:0:0:0:0:1:2', this.mitm, test);
  },

  'uses a parallel connection strategy': function(test) {
    const connector = new Connector({ host: 'localhost', port: 12345 }, true);

    const spy = this.sinon.spy(ParallelConnectionStrategy.prototype, 'connect');

    connector.execute(function(err, socket) {
      test.ifError(err);

      test.strictEqual(spy.callCount, 1);

      test.done();
    });
  }
};

exports['Connector without MultiSubnetFailover'] = {
  setUp: function(done) {
    this.mitm = new Mitm();
    this.mitm.enable();

    this.sinon = sinon.sandbox.create();

    done();
  },

  tearDown: function(done) {
    this.mitm.disable();
    this.sinon.restore();

    done();
  },

  'connects directly if given an IP address': function(test) {
    const connectionOptions = {
      host: '127.0.0.1',
      port: 12345,
      localAddress: '192.168.0.1'
    };
    const connector = new Connector(connectionOptions, false);

    let expectedSocket;
    this.mitm.once('connect', function(socket, options) {
      expectedSocket = socket;

      test.strictEqual(options, connectionOptions);
    });

    connector.execute(function(err, socket) {
      test.ifError(err);

      test.strictEqual(socket, expectedSocket);

      test.done();
    });
  },

  'uses a sequential connection strategy': function(test) {
    const connector = new Connector({ host: 'localhost', port: 12345 }, false);

    const spy = this.sinon.spy(SequentialConnectionStrategy.prototype, 'connect');

    connector.execute(function(err, socket) {
      test.ifError(err);

      test.strictEqual(spy.callCount, 1);

      test.done();
    });
  }
};

exports['SequentialConnectionStrategy'] = {
  setUp: function(done) {
    this.mitm = new Mitm();
    this.mitm.enable();

    done();
  },

  tearDown: function(done) {
    this.mitm.disable();

    done();
  },

  'tries to connect to all addresses in sequence': function(test) {
    const strategy = new SequentialConnectionStrategy([
      { address: '127.0.0.2' },
      { address: '2002:20:0:0:0:0:1:3' },
      { address: '127.0.0.4' }
    ], { port: 12345, localAddress: '192.168.0.1' });

    const attemptedConnections = [];
    this.mitm.on('connect', function(socket, options) {
      attemptedConnections.push(options);

      const expectedConnectionCount = attemptedConnections.length;
      const handler = () => {
        socket.removeListener('connect', handler);
        socket.removeListener('error', handler);

        test.strictEqual(attemptedConnections.length, expectedConnectionCount);
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
      test.ifError(err);

      test.strictEqual(attemptedConnections.length, 3);

      test.strictEqual(attemptedConnections[0].host, '127.0.0.2');
      test.strictEqual(attemptedConnections[0].port, 12345);
      test.strictEqual(attemptedConnections[0].localAddress, '192.168.0.1');

      test.strictEqual(attemptedConnections[1].host, '2002:20:0:0:0:0:1:3');
      test.strictEqual(attemptedConnections[1].port, 12345);
      test.strictEqual(attemptedConnections[1].localAddress, '192.168.0.1');

      test.strictEqual(attemptedConnections[2].host, '127.0.0.4');
      test.strictEqual(attemptedConnections[2].port, 12345);
      test.strictEqual(attemptedConnections[2].localAddress, '192.168.0.1');

      test.done();
    });
  },

  'passes the first succesfully connected socket to the callback': function(test) {
    const strategy = new SequentialConnectionStrategy([
      { address: '127.0.0.2' },
      { address: '2002:20:0:0:0:0:1:3' },
      { address: '127.0.0.4' }
    ], { port: 12345, localAddress: '192.168.0.1' });

    let expectedSocket;
    this.mitm.on('connect', function(socket, opts) {
      if (opts.host !== '127.0.0.4') {
        process.nextTick(() => {
          socket.emit('error', new Error());
        });
      } else {
        expectedSocket = socket;
      }
    });

    strategy.connect(function(err, socket) {
      test.strictEqual(expectedSocket, socket);

      test.done();
    });
  },

  'only attempts new connections until the first successful connection': function(test) {
    const strategy = new SequentialConnectionStrategy([
      { address: '127.0.0.2' },
      { address: '2002:20:0:0:0:0:1:3' },
      { address: '127.0.0.4' }
    ], { port: 12345, localAddress: '192.168.0.1' });

    const attemptedConnections = [];

    this.mitm.on('connect', function(socket, options) {
      attemptedConnections.push(options);
    });

    strategy.connect(function(err) {
      test.ifError(err);

      test.strictEqual(attemptedConnections.length, 1);

      test.strictEqual(attemptedConnections[0].host, '127.0.0.2');
      test.strictEqual(attemptedConnections[0].port, 12345);
      test.strictEqual(attemptedConnections[0].localAddress, '192.168.0.1');

      test.done();
    });
  },

  'fails if all sequential connections fail': function(test) {
    const strategy = new SequentialConnectionStrategy([
      { address: '127.0.0.2' },
      { address: '2002:20:0:0:0:0:1:3' },
      { address: '127.0.0.4' }
    ], { port: 12345, localAddress: '192.168.0.1' });

    this.mitm.on('connect', function(socket) {
      process.nextTick(() => {
        socket.emit('error', new Error());
      });
    });

    strategy.connect(function(err, socket) {
      test.equal('Could not connect (sequence)', err.message);

      test.done();
    });
  },

  'destroys all sockets except for the first succesfully connected socket': function(test) {
    const strategy = new SequentialConnectionStrategy([
      { address: '127.0.0.2' },
      { address: '2002:20:0:0:0:0:1:3' },
      { address: '127.0.0.4' }
    ], { port: 12345, localAddress: '192.168.0.1' });

    const attemptedSockets = [];

    this.mitm.on('connect', function(socket, options) {
      attemptedSockets.push(socket);

      if (options.host !== '127.0.0.4') {
        process.nextTick(() => {
          socket.emit('error', new Error());
        });
      }
    });

    strategy.connect(function(err, socket) {
      test.ifError(err);

      test.ok(attemptedSockets[0].destroyed);
      test.ok(attemptedSockets[1].destroyed);
      test.ok(!attemptedSockets[2].destroyed);

      test.done();
    });
  }
};

exports['ParallelConnectionStrategy'] = {
  setUp: function(done) {
    this.mitm = new Mitm();
    this.mitm.enable();

    done();
  },

  tearDown: function(done) {
    this.mitm.disable();

    done();
  },

  'tries to connect to all addresses in parallel': function(test) {
    const strategy = new ParallelConnectionStrategy([
      { address: '127.0.0.2' },
      { address: '2002:20:0:0:0:0:1:3' },
      { address: '127.0.0.4' }
    ], { port: 12345, localAddress: '192.168.0.1' });

    const attemptedConnections = [];

    this.mitm.on('connect', function(socket, options) {
      attemptedConnections.push(options);

      socket.once('connect', function() {
        test.strictEqual(attemptedConnections.length, 3);
      });
    });

    strategy.connect(function(err, socket) {
      test.ifError(err);

      test.strictEqual(attemptedConnections[0].host, '127.0.0.2');
      test.strictEqual(attemptedConnections[0].port, 12345);
      test.strictEqual(attemptedConnections[0].localAddress, '192.168.0.1');

      test.strictEqual(attemptedConnections[1].host, '2002:20:0:0:0:0:1:3');
      test.strictEqual(attemptedConnections[1].port, 12345);
      test.strictEqual(attemptedConnections[1].localAddress, '192.168.0.1');

      test.strictEqual(attemptedConnections[2].host, '127.0.0.4');
      test.strictEqual(attemptedConnections[2].port, 12345);
      test.strictEqual(attemptedConnections[2].localAddress, '192.168.0.1');

      test.done();
    });
  },

  'fails if all parallel connections fail': function(test) {
    const strategy = new ParallelConnectionStrategy([
      { address: '127.0.0.2' },
      { address: '2002:20:0:0:0:0:1:3' },
      { address: '127.0.0.4' }
    ], { port: 12345, localAddress: '192.168.0.1' });

    this.mitm.on('connect', function(socket) {
      process.nextTick(() => {
        socket.emit('error', new Error());
      });
    });

    strategy.connect(function(err, socket) {
      test.equal('Could not connect (parallel)', err.message);

      test.done();
    });
  },

  'passes the first succesfully connected socket to the callback': function(test) {
    const strategy = new ParallelConnectionStrategy([
      { address: '127.0.0.2' },
      { address: '2002:20:0:0:0:0:1:3' },
      { address: '127.0.0.4' }
    ], { port: 12345, localAddress: '192.168.0.1' });

    let expectedSocket;
    this.mitm.on('connect', function(socket, opts) {
      if (opts.host !== '127.0.0.4') {
        process.nextTick(() => {
          socket.emit('error', new Error());
        });
      } else {
        expectedSocket = socket;
      }
    });

    strategy.connect(function(err, socket) {
      test.strictEqual(expectedSocket, socket);

      test.done();
    });
  },

  'destroys all sockets except for the first succesfully connected socket': function(test) {
    const strategy = new ParallelConnectionStrategy([
      { address: '127.0.0.2' },
      { address: '2002:20:0:0:0:0:1:3' },
      { address: '127.0.0.4' }
    ], { port: 12345, localAddress: '192.168.0.1' });

    const attemptedSockets = [];

    this.mitm.on('connect', function(socket) {
      attemptedSockets.push(socket);
    });

    strategy.connect(function(err, socket) {
      test.ifError(err);

      test.ok(!attemptedSockets[0].destroyed);
      test.ok(attemptedSockets[1].destroyed);
      test.ok(attemptedSockets[2].destroyed);

      test.done();
    });
  }
};
