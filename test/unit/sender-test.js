'use strict';

const Dgram = require('dgram');
const Sender = require('../../src/sender').Sender;
const ParallelSendStrategy = require('../../src/sender').ParallelSendStrategy;
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
    if (this.listenerCount('error') > 0) {
      this.emit('error', this);
    }
  } else {
    if (this.listenerCount('message') > 0) {
      this.emit('message', this);
    }
  }
};

// Stub function to mimic socket 'send' without causing network activity.
const sendStub = function(buffer, offset, length, port, ipAddress) {
  process.nextTick(emitEvent.bind(this));
};

const sendToIpCommonTestSetup = function(ipAddress, udpVersion, sendResult) {
  // Create socket exactly like the Sender class would create while stubbing
  // some methods for unit testing.
  this.testSocket = Dgram.createSocket(udpVersion);
  this.socketSendStub = this.sinon.stub(this.testSocket, 'send', sendStub);
  this.socketCloseSpy = this.sinon.spy(this.testSocket, 'close');

  // This allows the emitEvent method to emit the right event for the given test.
  this.testSocket.sendResult = sendResult;

  // Stub createSocket method to return a socket created exactly like the
  // method would but with a few methods stubbed out above.
  this.createSocketStub = this.sinon.stub(Dgram, 'createSocket');
  this.createSocketStub.withArgs(udpVersion).returns(this.testSocket);

  this.sender = new Sender(ipAddress, anyPort, anyRequest);
};

const sendToIpCommonTestValidation = function(test, ipAddress) {
  test.ok(this.createSocketStub.calledOnce);
  test.ok(this.socketSendStub.withArgs(anyRequest, 0, anyRequest.length, anyPort, ipAddress).calledOnce);
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
    sendToIpCommonTestSetup.call(this, anyIpv4, udpIpv4, sendResultSuccess);

    this.sender.execute((error, message) => {
      test.strictEqual(error, null);
      test.strictEqual(message, this.testSocket);

      test.ok(this.socketCloseSpy.withArgs().calledOnce);
      test.done();
    });

    sendToIpCommonTestValidation.call(this, test, anyIpv4);
  },

  'send to IPv6': function(test) {
    sendToIpCommonTestSetup.call(this, anyIpv6, udpIpv6, sendResultSuccess);

    this.sender.execute((error, message) => {
      test.strictEqual(error, null);
      test.strictEqual(message, this.testSocket);

      test.ok(this.socketCloseSpy.withArgs().calledOnce);
      test.done();
    });

    sendToIpCommonTestValidation.call(this, test, anyIpv6);
  },

  'send fails': function(test) {
    sendToIpCommonTestSetup.call(this, anyIpv4, udpIpv4, sendResultError);

    this.sender.execute((error, message) => {
      test.strictEqual(error, this.testSocket);
      test.strictEqual(message, undefined);

      test.ok(this.socketCloseSpy.withArgs().calledOnce);
      test.done();
    });

    sendToIpCommonTestValidation.call(this, test, anyIpv4);
  },

  'send cancel': function(test) {
    sendToIpCommonTestSetup.call(this, anyIpv4, udpIpv4, sendResultCancel);

    this.sender.execute((error, message) => {
      test.ok(false, 'Should never get here.');
    });

    sendToIpCommonTestValidation.call(this, test, anyIpv4);

    this.sender.cancel();
    test.ok(this.socketCloseSpy.withArgs().calledOnce);
    test.done();
  }
};


const sendToHostCommonTestSetup = function(lookupError) {
  // Since we're testing Sender class, we just want to verify that the 'send'/'cancel'
  // method(s) on the ParallelSendStrategy class are/is being invoked. So we stub out
  // the methods to validate they're invoked correctly.
  const testStrategy = new ParallelSendStrategy(this.addresses, anyPort, anyRequest);
  const callback = () => { };
  this.strategySendStub = this.sinon.stub(testStrategy, 'send');
  this.strategySendStub.withArgs(callback);
  this.strategyCancelStub = this.sinon.stub(testStrategy, 'cancel');
  this.strategyCancelStub.withArgs();

  this.sender = new Sender(anyHost, anyPort, anyRequest);

  // Stub out the lookupAll method to prevent network activity from doing a DNS
  // lookup. Succeeds or fails depending on lookupError.
  this.lookupAllStub = this.sinon.stub(this.sender, 'invokeLookupAll');
  this.lookupAllStub.callsArgWithAsync(1, lookupError, this.addresses);

  // Stub the create strategy method for the test to return a strategy object created
  // exactly like the method would but with a few methods stubbed.
  this.createStrategyStub = this.sinon.stub(this.sender, 'createParallelSendStrategy');
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

  'send basic': function(test) {
    const lookupError = null;
    sendToHostCommonTestSetup.call(this, lookupError);

    test.ok(this.lookupAllStub.calledOnce);

    const validate = () => {
      test.ok(this.createStrategyStub.calledOnce);
      test.ok(this.strategySendStub.calledOnce);
      test.done();
    };

    process.nextTick(validate);
  },

  'send cancel': function(test) {
    const lookupError = null;
    sendToHostCommonTestSetup.call(this, lookupError);

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
    const lookupError = new Error('some error.');

    sendToHostCommonTestSetup.call(this, lookupError);

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
    const lookupError = new Error('some error.');

    sendToHostCommonTestSetup.call(this, lookupError);
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

  // Create sockets for IPv4 and IPv6 with send and close stubbed out to
  // prevent network activity.
  this.testSockets = { };
  this.testSockets[udpIpv4] = Dgram.createSocket(udpIpv4);
  this.testSockets[udpIpv6] = Dgram.createSocket(udpIpv6);

  let key;
  for (key in this.testSockets) {
    this.testSockets[key].socketSendStub = this.sinon.stub(this.testSockets[key], 'send', sendStub);
    this.testSockets[key].socketCloseSpy = this.sinon.spy(this.testSockets[key], 'close');

    // This allows emitEvent method to fire an 'error' or 'message' event appropriately.
    // A given test may overwrite this value for specific sockets to test different
    // scenarios.
    this.testSockets[key].sendResult = sendResultSuccess;
  }

  for (let j = 0; j < this.testData.length; j++) {
    this.testData[j].testSocket = this.testSockets[this.testData[j].udpVersion];
  }

  // Stub createSocket method to returns a socket created exactly like the
  // method would but with a few methods stubbed out above.
  this.createSocketStub = this.sinon.stub(Dgram, 'createSocket');
  this.createSocketStub.withArgs(udpIpv4).returns(this.testSockets[udpIpv4]);
  this.createSocketStub.withArgs(udpIpv6).returns(this.testSockets[udpIpv6]);

  this.parallelSendStrategy = new ParallelSendStrategy(this.testData, anyPort, anyRequest);
};

const commonStrategyTestValidation = function(test) {
  let key;
  for (key in this.testSockets) {
    test.strictEqual(this.testSockets[key].socketSendStub.callCount, 2);
    test.strictEqual(this.testSockets[key].socketCloseSpy.callCount, 1);
  }

  test.strictEqual(this.createSocketStub.callCount, 2);

  test.done();
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
    this.parallelSendStrategy.send((error, message) => {
      test.strictEqual(error, null);

      // We should get the message only on the first socket, which is Ipv4.
      test.strictEqual(this.testData[0].udpVersion, udpIpv4);
      test.strictEqual(message, this.testSockets[udpIpv4]);
      commonStrategyTestValidation.call(this, test);
    });
  },

  'send IPv4 fail.': function(test) {
    // Setup sends to fail on Ipv4 socket.
    this.testSockets[udpIpv4].sendResult = sendResultError;

    this.parallelSendStrategy.send((error, message) => {
      // Even though the IPv4 socket sends fail, we should not get an error
      // as the other sockets succeed.
      test.strictEqual(error, null);

      // We setup the IPv4 socket sends to fail. So we should get the message on the
      // Ipv6 socket.
      test.strictEqual(message, this.testSockets[udpIpv6]);

      commonStrategyTestValidation.call(this, test);
    });
  },

  'send IPv6 fail.': function(test) {
    // Setup sends to fail on Ipv6 socket.
    this.testSockets[udpIpv6].sendResult = sendResultError;

    this.parallelSendStrategy.send((error, message) => {
      // Even though the IPv6 socket sends fail, we should not get an error
      // as the other sockets succeed.
      test.strictEqual(error, null);

      // We setup the IPv6 socket sends to fail. So we should get the message on the
      // Ipv4 socket.
      test.strictEqual(message, this.testSockets[udpIpv4]);

      commonStrategyTestValidation.call(this, test);
    });
  },

  'send all IPs fail.': function(test) {
    // Setup IPv4 and IPv6 sockets to fail on socket send.
    this.testSockets[udpIpv4].sendResult = sendResultError;
    this.testSockets[udpIpv6].sendResult = sendResultError;

    this.parallelSendStrategy.send((error, message) => {
      // All socket sends fail. We should get an error on the last socket fail.
      test.strictEqual(error, this.testSockets[this.testData[this.testData.length - 1].udpVersion]);

      test.strictEqual(message, undefined);

      commonStrategyTestValidation.call(this, test);
    });
  },

  'send cancel.': function(test) {
    this.parallelSendStrategy.send((error, message) => {
      // We should not get a callback as the send got cancelled.
      test.ok(false, 'Should never get here.');
    });

    this.parallelSendStrategy.cancel();

    commonStrategyTestValidation.call(this, test);
  }
};
