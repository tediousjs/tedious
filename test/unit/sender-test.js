'use strict';

const Dgram = require('dgram');
const Sender = require('../../src/sender').Sender;
const ParallelSendStrategy = require('../../src/sender').ParallelSendStrategy;
const SequentialSendStrategy = require('../../src/sender').SequentialSendStrategy;
const Sinon = require('sinon');

const anyPort = 1234;
const anyIpv4 = '1.2.3.4';
const anyIpv6 = '2002:20:0:0:0:0:1:3';
const anyHost = 'myhostname';
const anyRequest = new Buffer(0x02);

const udpIpv4 = 'udp4';
const udpIpv6 = 'udp6';

const sendResultSuccess = 0;
const sendResultError = 1;
const sendResultCancel = 2;

// Stub function to mimic socket emitting 'error' and 'message' events.
const emitEvent = function() {
  if (this.sendResult === sendResultError) {
    this.emit('error', this);
  } else {
    this.emit('message', this);
  }
};

// Stub function to mimic socket 'send' without causing network activity.
const sendStub = function(buffer, offset, length, port, ipAddress) {
  process.nextTick(emitEvent.bind(this));
};

const sendToIpCommonTestSetup = function(ipAddress, udpVersion, sendResult, multiSubnetFailover) {
  // Create socket exactly like the Sender class would create while stubbing
  // some methods for unit testing.
  this.testSocket = Dgram.createSocket(udpVersion);
  this.socketSendStub = this.sinon.stub(this.testSocket, 'send', sendStub);
  this.socketCloseStub = this.sinon.stub(this.testSocket, 'close');

  // This allows the emitEvent method to emit the right event for the given test.
  this.testSocket.sendResult = sendResult;

  // Stub createSocket method to return a socket created exactly like the
  // method would but with a few methods stubbed out above.
  this.createSocketStub = this.sinon.stub(Dgram, 'createSocket');
  this.createSocketStub.withArgs(udpVersion).returns(this.testSocket);

  this.sender = new Sender(ipAddress, anyPort, anyRequest, multiSubnetFailover);
};

exports['Sender send to IP address'] = {
  setUp: function(done) {
    this.sinon = Sinon.sandbox.create();
    done();
  },

  tearDown: function(done) {
    this.sinon.restore();
    done();
  },

  'send to IPv4': function(test) {
    const multiSubnetFailover = false;
    sendToIpCommonTestSetup.call(this, anyIpv4, udpIpv4, sendResultSuccess, multiSubnetFailover);

    this.sender.execute((error, message) => {
      test.strictEqual(error, null);
      test.strictEqual(message, this.testSocket);

      test.ok(this.socketCloseStub.withArgs().calledOnce);
      test.done();
    });

    test.ok(this.createSocketStub.calledOnce);
    test.ok(this.socketSendStub.withArgs(anyRequest, 0, anyRequest.length, anyPort, anyIpv4).calledOnce);
  },

  'send to IPv6': function(test) {
    const multiSubnetFailover = true;
    sendToIpCommonTestSetup.call(this, anyIpv6, udpIpv6, sendResultSuccess, multiSubnetFailover);

    this.sender.execute((error, message) => {
      test.strictEqual(error, null);
      test.strictEqual(message, this.testSocket);

      test.ok(this.socketCloseStub.withArgs().calledOnce);
      test.done();
    });

    test.ok(this.createSocketStub.calledOnce);
    test.ok(this.socketSendStub.withArgs(anyRequest, 0, anyRequest.length, anyPort, anyIpv6).calledOnce);
  },

  'send fails': function(test) {
    const multiSubnetFailover = true;
    sendToIpCommonTestSetup.call(this, anyIpv4, udpIpv4, sendResultError, multiSubnetFailover);

    this.sender.execute((error, message) => {
      test.strictEqual(error, this.testSocket);
      test.strictEqual(message, undefined);

      test.ok(this.socketCloseStub.withArgs().calledOnce);
      test.done();
    });

    test.ok(this.createSocketStub.calledOnce);
    test.ok(this.socketSendStub.withArgs(anyRequest, 0, anyRequest.length, anyPort, anyIpv4).calledOnce);
  },

  'send cancel': function(test) {
    const multiSubnetFailover = true;
    sendToIpCommonTestSetup.call(this, anyIpv4, udpIpv4, sendResultCancel, multiSubnetFailover);

    this.sender.execute((error, message) => {
      test.ok(false, 'Should never get here.');
    });

    test.ok(this.createSocketStub.calledOnce);
    test.ok(this.socketSendStub.withArgs(anyRequest, 0, anyRequest.length, anyPort, anyIpv4).calledOnce);

    this.sender.cancel();
    test.ok(this.socketCloseStub.withArgs().calledOnce);
    test.done();
  }
};


const sendToHostCommonTestSetup = function(lookupError, multiSubnetFailover, testStrategy, createStrategyMethod) {
  // Since we're testing Sender class, we just want to verify that the 'send' and/or
  // 'cancel' method on the right strategy class are/is being invoked. So we stub out
  // the methods to validate they're invoked correctly.
  const callback = () => { };
  this.strategySendStub = this.sinon.stub(testStrategy, 'send');
  this.strategySendStub.withArgs(callback);
  this.strategyCancelStub = this.sinon.stub(testStrategy, 'cancel');
  this.strategyCancelStub.withArgs();

  this.sender = new Sender(anyHost, anyPort, anyRequest, multiSubnetFailover);

  // Stub out the lookupAll method to prevent network activity from doing a DNS
  // lookup. Succeeds or fails depending on lookupError.
  this.lookupAllStub = this.sinon.stub(this.sender, 'invokeLookupAll');
  this.lookupAllStub.callsArgWithAsync(1, lookupError, this.addresses);

  // Stub the create strategy method for the test to return a strategy object created
  // exactly like the method would but with a few methods stubbed.
  this.createStrategyStub = this.sinon.stub(this.sender, createStrategyMethod);
  this.createStrategyStub.withArgs(this.addresses, anyPort, anyRequest).returns(testStrategy);

  this.sender.execute(callback);
};

exports['Sender send to hostname'] = {
  setUp: function(done) {
    this.sinon = Sinon.sandbox.create();

    // Set of IP addresses to be returned by stubbed out lookupAll method.
    this.addresses = [
      { address: '127.0.0.2' },
      { address: '2002:20:0:0:0:0:1:3' },
      { address: '127.0.0.4' }
    ];

    done();
  },

  tearDown: function(done) {
    this.sinon.restore();
    done();
  },

  // lookupAll is async. So we push out validation to next tick to run
  // after lookupAll asyn callback is done in all the tests below.

  'send with MultiSubnetFailover': function(test) {
    const multiSubnetFailover = true;
    const lookupError = null;
    const testStrategy = new ParallelSendStrategy(this.addresses, anyPort, anyRequest);
    const createStrategyMethod = 'createParallelSendStrategy';

    sendToHostCommonTestSetup.call(this, lookupError, multiSubnetFailover, testStrategy, createStrategyMethod);

    test.ok(this.lookupAllStub.calledOnce);

    const validate = () => {
      test.ok(this.createStrategyStub.calledOnce);
      test.ok(this.strategySendStub.calledOnce);
      test.done();
    };

    process.nextTick(validate);
  },

  'send with MultiSubnetFailover cancel': function(test) {
    const multiSubnetFailover = true;
    const lookupError = null;
    const testStrategy = new ParallelSendStrategy(this.addresses, anyPort, anyRequest);
    const createStrategyMethod = 'createParallelSendStrategy';

    sendToHostCommonTestSetup.call(this, lookupError, multiSubnetFailover, testStrategy, createStrategyMethod);

    test.ok(this.lookupAllStub.calledOnce);

    const validate = () => {
      test.ok(this.createStrategyStub.calledOnce);
      test.ok(this.strategySendStub.calledOnce);

      this.sender.cancel();
      test.ok(this.strategyCancelStub.calledOnce);
      test.done();
    };

    process.nextTick(validate);
  },

  'send without MultiSubnetFailover': function(test) {
    const multiSubnetFailover = false;
    const lookupError = null;
    const testStrategy = new SequentialSendStrategy(this.addresses, anyPort, anyRequest);
    const createStrategyMethod = 'createSequentialSendStrategy';

    sendToHostCommonTestSetup.call(this, lookupError, multiSubnetFailover, testStrategy, createStrategyMethod);

    test.ok(this.lookupAllStub.calledOnce);

    const validate = () => {
      test.ok(this.createStrategyStub.calledOnce);
      test.ok(this.strategySendStub.calledOnce);
      test.done();
    };

    process.nextTick(validate);
  },

  'send without MultiSubnetFailover cancel': function(test) {
    const multiSubnetFailover = false;
    const lookupError = null;
    const testStrategy = new SequentialSendStrategy(this.addresses, anyPort, anyRequest);
    const createStrategyMethod = 'createSequentialSendStrategy';

    sendToHostCommonTestSetup.call(this, lookupError, multiSubnetFailover, testStrategy, createStrategyMethod);

    test.ok(this.lookupAllStub.calledOnce);

    const validate = () => {
      test.ok(this.createStrategyStub.calledOnce);
      test.ok(this.strategySendStub.calledOnce);

      this.sender.cancel();
      test.ok(this.strategyCancelStub.calledOnce);
      test.done();
    };

    process.nextTick(validate);
  },

  'send lookup error': function(test) {
    const multiSubnetFailover = false;
    const lookupError = new Error('some error.');
    const testStrategy = new SequentialSendStrategy(this.addresses, anyPort, anyRequest);
    const createStrategyMethod = 'createSequentialSendStrategy';

    sendToHostCommonTestSetup.call(this, lookupError, multiSubnetFailover, testStrategy, createStrategyMethod);

    test.ok(this.lookupAllStub.calledOnce);

    const validate = () => {
      // Strategy object should not be created on lookup error.
      test.strictEqual(this.createStrategyStub.callCount, 0);
      test.strictEqual(this.strategySendStub.callCount, 0);
      test.done();
    };

    process.nextTick(validate);
  },

  'send cancel on lookup error': function(test) {
    const multiSubnetFailover = false;
    const lookupError = new Error('some error.');
    const testStrategy = new SequentialSendStrategy(this.addresses, anyPort, anyRequest);
    const createStrategyMethod = 'createSequentialSendStrategy';

    sendToHostCommonTestSetup.call(this, lookupError, multiSubnetFailover, testStrategy, createStrategyMethod);
    this.sender.cancel();

    test.ok(this.lookupAllStub.calledOnce);

    const validate = () => {
      // Strategy object should not be created on lookup error.
      test.strictEqual(this.createStrategyStub.callCount, 0);
      test.strictEqual(this.strategySendStub.callCount, 0);
      test.strictEqual(this.strategyCancelStub.callCount, 0);
      test.done();
    };

    process.nextTick(validate);
  }
};


const commonStrategyTestSetup = function() {
  // IP addresses returned by DNS reverse lookup and passed to the Strategy.
  this.testData = [
    { address: '1.2.3.4', udpVersion: udpIpv4 },
    { address: '2002:20:0:0:0:0:1:3', udpVersion: udpIpv6 },
    { address: '2002:30:0:0:0:0:2:4', udpVersion: udpIpv6 },
    { address: '5.6.7.8', udpVersion: udpIpv4 }
  ];

  // Create sockets for each of the IP addresses with send and close stubbed out to
  // prevent network activity.
  for (let j = 0; j < this.testData.length; j++) {
    this.testData[j].testSocket = Dgram.createSocket(this.testData[j].udpVersion);
    this.testData[j].socketSendStub = this.sinon.stub(this.testData[j].testSocket, 'send', sendStub);
    this.testData[j].socketCloseStub = this.sinon.stub(this.testData[j].testSocket, 'close');

    // This allows emitEvent method to fire an 'error' or 'message' event appropriately.
    // A given test may overwrite this value for specific sockets to test different
    // scenarios.
    this.testData[j].testSocket.sendResult = sendResultSuccess;
  }

  // Stub createSocket method to returns a socket created exactly like the
  // method would but with a few methods stubbed out above.
  this.createSocketStub = this.sinon.stub(Dgram, 'createSocket');
  this.createSocketStub.withArgs(udpIpv4).onFirstCall().returns(this.testData[0].testSocket);
  this.createSocketStub.withArgs(udpIpv6).onFirstCall().returns(this.testData[1].testSocket);
  this.createSocketStub.withArgs(udpIpv6).onSecondCall().returns(this.testData[2].testSocket);
  this.createSocketStub.withArgs(udpIpv4).onSecondCall().returns(this.testData[3].testSocket);
};

exports['ParallelSendStrategy'] = {
  setUp: function(done) {
    this.sinon = Sinon.sandbox.create();
    commonStrategyTestSetup.call(this);
    done();
  },

  tearDown: function(done) {
    this.sinon.restore();
    done();
  },

  'send all IPs success.': function(test) {
    const parallelSendStrategy = new ParallelSendStrategy(this.testData, anyPort, anyRequest);
    parallelSendStrategy.send((error, message) => {
      test.strictEqual(error, null);

      // We should get the message only on the first socket.
      test.strictEqual(message, this.testData[0].testSocket);

      for (let j = 0; j < this.testData.length; j++) {
        test.ok(this.testData[j].socketSendStub.calledOnce);
        test.ok(this.testData[j].socketCloseStub.calledOnce);
      }

      test.strictEqual(this.createSocketStub.callCount, this.testData.length);

      test.done();
    });
  },

  'send one IP fail.': function(test) {
    // Setup first socket to fail on socket send.
    this.testData[0].testSocket.sendResult = sendResultError;

    const parallelSendStrategy = new ParallelSendStrategy(this.testData, anyPort, anyRequest);
    parallelSendStrategy.send((error, message) => {
      // Even though the first socket fails on send, we should not get an error
      // as the other sockets succeed.
      test.strictEqual(error, null);

      // We setup the first send to fail. So we should get the message on the
      // second socket.
      test.strictEqual(message, this.testData[1].testSocket);

      for (let j = 0; j < this.testData.length; j++) {
        test.ok(this.testData[j].socketSendStub.calledOnce);
        test.ok(this.testData[j].socketCloseStub.calledOnce);
      }

      test.strictEqual(this.createSocketStub.callCount, this.testData.length);

      test.done();
    });
  },

  'send two IPs fail.': function(test) {
    // Setup first two sockets to fail on socket send.
    this.testData[0].testSocket.sendResult = sendResultError;
    this.testData[1].testSocket.sendResult = sendResultError;

    const parallelSendStrategy = new ParallelSendStrategy(this.testData, anyPort, anyRequest);
    parallelSendStrategy.send((error, message) => {
      // Even though the first two sockets fails on send, we should not get an error
      // as the other sockets succeed.
      test.strictEqual(error, null);

      // We setup the first two sends to fail. So we should get the message on the
      // third socket.
      test.strictEqual(message, this.testData[2].testSocket);

      for (let j = 0; j < this.testData.length; j++) {
        test.ok(this.testData[j].socketSendStub.calledOnce);
        test.ok(this.testData[j].socketCloseStub.calledOnce);
      }

      test.strictEqual(this.createSocketStub.callCount, this.testData.length);

      test.done();
    });
  },

  'send all IPs fail.': function(test) {
    // Setup all sockets to fail on socket send.
    for (let j = 0; j < this.testData.length; j++) {
      this.testData[j].testSocket.sendResult = sendResultError;
    }

    const parallelSendStrategy = new ParallelSendStrategy(this.testData, anyPort, anyRequest);
    parallelSendStrategy.send((error, message) => {
      // All socket sends fail. We should get an error on the last socket fail.
      test.strictEqual(error, this.testData[this.testData.length - 1].testSocket);

      test.strictEqual(message, undefined);

      for (let j = 0; j < this.testData.length; j++) {
        test.ok(this.testData[j].socketSendStub.calledOnce);
        test.ok(this.testData[j].socketCloseStub.calledOnce);
      }

      test.strictEqual(this.createSocketStub.callCount, this.testData.length);

      test.done();
    });
  },

  'send cancel.': function(test) {
    const parallelSendStrategy = new ParallelSendStrategy(this.testData, anyPort, anyRequest);
    parallelSendStrategy.send((error, message) => {
      // We should not get a callback as the send got cancelled.
      test.ok(false, 'Should never get here.');
    });

    parallelSendStrategy.cancel();

    for (let j = 0; j < this.testData.length; j++) {
      test.ok(this.testData[j].socketSendStub.calledOnce);
      test.ok(this.testData[j].socketCloseStub.calledOnce);
    }

    test.strictEqual(this.createSocketStub.callCount, this.testData.length);

    test.done();
  }
};

exports['SequentialSendStrategy'] = {
  setUp: function(done) {
    this.sinon = Sinon.sandbox.create();
    commonStrategyTestSetup.call(this);
    done();
  },

  tearDown: function(done) {
    this.sinon.restore();
    done();
  },

  'send all IPs success.': function(test) {
    const sequentialSendStrategy = new SequentialSendStrategy(this.testData, anyPort, anyRequest);
    sequentialSendStrategy.send((error, message) => {
      test.strictEqual(error, null);

      // We should get the message only on the first socket.
      test.strictEqual(message, this.testData[0].testSocket);

      test.ok(this.testData[0].socketSendStub.calledOnce);
      test.ok(this.testData[0].socketCloseStub.calledOnce);

      // Send should be invoked only on the first socket.
      for (let j = 1; j < this.testData.length; j++) {
        test.strictEqual(this.testData[j].socketSendStub.callCount, 0);
        test.strictEqual(this.testData[j].socketCloseStub.callCount, 0);
      }

      test.strictEqual(this.createSocketStub.callCount, 1);

      test.done();
    });
  },

  'send one IP fail.': function(test) {
    // Setup first socket to fail on socket send.
    this.testData[0].testSocket.sendResult = sendResultError;

    const sequentialSendStrategy = new SequentialSendStrategy(this.testData, anyPort, anyRequest);
    sequentialSendStrategy.send((error, message) => {
      test.strictEqual(error, null);

      // We should get the message on the second socket as the first one fails.
      test.strictEqual(message, this.testData[1].testSocket);

      // Send should be invoked only on the first two sockets.
      for (let j = 0; j < this.testData.length; j++) {
        if (j < 2) {
          test.ok(this.testData[j].socketSendStub.calledOnce);
          test.ok(this.testData[j].socketCloseStub.calledOnce);
        } else {
          test.strictEqual(this.testData[j].socketSendStub.callCount, 0);
          test.strictEqual(this.testData[j].socketCloseStub.callCount, 0);
        }
      }

      // Since the first socket send fails, we should have two invocations of createSocket.
      test.strictEqual(this.createSocketStub.callCount, 2);

      test.done();
    });
  },

  'send two IPs fail.': function(test) {
    // Setup first two socket to fail on socket send.
    this.testData[0].testSocket.sendResult = sendResultError;
    this.testData[1].testSocket.sendResult = sendResultError;

    const sequentialSendStrategy = new SequentialSendStrategy(this.testData, anyPort, anyRequest);
    sequentialSendStrategy.send((error, message) => {
      test.strictEqual(error, null);

      // We should get the message on the third socket as the first two fails.
      test.strictEqual(message, this.testData[2].testSocket);

      // Send should be invoked only on the first three sockets.
      for (let j = 0; j < this.testData.length; j++) {
        if (j < 3) {
          test.ok(this.testData[j].socketSendStub.calledOnce);
          test.ok(this.testData[j].socketCloseStub.calledOnce);
        } else {
          test.strictEqual(this.testData[j].socketSendStub.callCount, 0);
          test.strictEqual(this.testData[j].socketCloseStub.callCount, 0);
        }
      }

      // Since the first two socket sends fail, we should have three invocations of createSocket.
      test.strictEqual(this.createSocketStub.callCount, 3);

      test.done();
    });
  },

  'send all IPs fail.': function(test) {
    // Setup all sockets to fail on socket send.
    for (let j = 0; j < this.testData.length; j++) {
      this.testData[j].testSocket.sendResult = sendResultError;
    }

    const sequentialSendStrategy = new SequentialSendStrategy(this.testData, anyPort, anyRequest);
    sequentialSendStrategy.send((error, message) => {
      // All socket sends fail. We should get an error on the last socket fail.
      test.strictEqual(error, this.testData[this.testData.length - 1].testSocket);

      test.strictEqual(message, undefined);

      // Send should be invoked on all sockets.
      for (let j = 0; j < this.testData.length; j++) {
        test.ok(this.testData[j].socketSendStub.calledOnce);
        test.ok(this.testData[j].socketCloseStub.calledOnce);
      }

      test.strictEqual(this.createSocketStub.callCount, this.testData.length);

      test.done();
    });
  },

  'send cancel.': function(test) {
    const sequentialSendStrategy = new SequentialSendStrategy(this.testData, anyPort, anyRequest);
    sequentialSendStrategy.send((error, message) => {
      // We should not get a callback as the send got cancelled.
      test.ok(false, 'Should never get here.');
    });

    sequentialSendStrategy.cancel();

    // Send should be invoked only on the first socket.
    for (let j = 0; j < this.testData.length; j++) {
      if (j === 0) {
        test.ok(this.testData[j].socketSendStub.calledOnce);
        test.ok(this.testData[j].socketCloseStub.calledOnce);
      } else {
        test.strictEqual(this.testData[j].socketSendStub.callCount, 0);
        test.strictEqual(this.testData[j].socketCloseStub.callCount, 0);
      }
    }

    test.strictEqual(this.createSocketStub.callCount, 1);

    test.done();
  }
};
