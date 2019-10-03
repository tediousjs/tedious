const Dgram = require('dgram');
const Sender = require('../../src/sender').Sender;
const ParallelSendStrategy = require('../../src/sender').ParallelSendStrategy;
const sinon = require('sinon');
const assert = require('chai').assert;

const anyPort = 1234;
const anyIpv4 = '1.2.3.4';
const anyIpv6 = '2002:20:0:0:0:0:1:3';
const anyHost = 'myhostname';
const anyRequest = Buffer.alloc(0x02);

const udpIpv4 = 'udp4';
const udpIpv6 = 'udp6';

const sendResultSuccess = 0;
const sendResultError = 1;
const sendResultCancel = 2;

// Stub function to mimic socket emitting 'error' and 'message' events.
function emitEvent() {
  if (this.sendResult === sendResultError) {
    if (this.listeners('error') && this.listeners('error').length > 0) {
      this.emit('error', this);
    }
  } else if (this.listeners('message') && this.listeners('message').length > 0) {
    this.emit('message', this);
  }
}

// Stub function to mimic socket 'send' without causing network activity.
function sendStub(buffer, offset, length, port, ipAddress) {
  process.nextTick(emitEvent.bind(this));
}

// TODO: Refactor functions above ^^^^^^^

describe('Sender send to IP address', function() {
  describe('Send', function() {
    let glob;

    function sendToIpCommonTestSetup(ipAddress, udpVersion, sendResult) {
      // Create socket exactly like the Sender class would create while stubbing
      // some methods for unit testing.
      this.testSocket = Dgram.createSocket(udpVersion);
      this.socketSendStub = sinon.stub(this.testSocket, 'send').callsFake(sendStub);
      this.socketCloseSpy = sinon.spy(this.testSocket, 'close');

      // This allows the emitEvent method to emit the right event for the given test.
      this.testSocket.sendResult = sendResult;

      // Stub createSocket method to return a socket created exactly like the
      // method would but with a few methods stubbed out above.
      this.createSocketStub = sinon.stub(Dgram, 'createSocket');
      this.createSocketStub.withArgs(udpVersion).returns(this.testSocket);

      this.sender = new Sender(ipAddress, anyPort, anyRequest);
    }

    function sendToIpCommonTestValidation(ipAddress) {
      assert.isOk(this.createSocketStub.calledOnce);
      assert.isOk(
        this.socketSendStub.withArgs(
          anyRequest,
          0,
          anyRequest.length,
          anyPort,
          ipAddress
        ).calledOnce
      );
    }

    beforeEach(function() {
      glob = {};
    });

    afterEach(function() {
      sinon.restore();
    });

    it('should send to IPv4', function(done) {

      sendToIpCommonTestSetup.call(glob, anyIpv4, udpIpv4, sendResultSuccess);

      glob.sender.execute((error, message) => {
        assert.strictEqual(error, null);
        assert.strictEqual(message, glob.testSocket);

        assert.isOk(glob.socketCloseSpy.withArgs().calledOnce);
        done();
      });

      sendToIpCommonTestValidation.call(glob, anyIpv4);
    });

    it('should sent to IPv6', function(done) {
      sendToIpCommonTestSetup.call(glob, anyIpv6, udpIpv6, sendResultSuccess);

      glob.sender.execute((error, message) => {
        assert.strictEqual(error, null);
        assert.strictEqual(message, glob.testSocket);

        assert.isOk(glob.socketCloseSpy.withArgs().calledOnce);
        done();
      });

      sendToIpCommonTestValidation.call(glob, anyIpv6);
    });

    it('should send fails', function(done) {
      sendToIpCommonTestSetup.call(glob, anyIpv4, udpIpv4, sendResultError);

      glob.sender.execute((error, message) => {
        assert.strictEqual(error, glob.testSocket);
        assert.strictEqual(message, undefined);

        assert.isOk(glob.socketCloseSpy.withArgs().calledOnce);
        done();
      });

      sendToIpCommonTestValidation.call(glob, anyIpv4);
    });

    it('should send cancel', function(done) {
      sendToIpCommonTestSetup.call(glob, anyIpv4, udpIpv4, sendResultCancel);

      glob.sender.execute((error, message) => {
        assert.isOk(false, 'Should never get here.');
      });

      sendToIpCommonTestValidation.call(glob, anyIpv4);

      glob.sender.cancel();
      assert.isOk(glob.socketCloseSpy.withArgs().calledOnce);
      done();
    });
  });
});

function sendToHostCommonTestSetup(lookupError) {
  // Since we're testing Sender class, we just want to verify that the 'send'/'cancel'
  // method(s) on the ParallelSendStrategy class are/is being invoked. So we stub out
  // the methods to validate they're invoked correctly.
  const testStrategy = new ParallelSendStrategy(
    this.addresses,
    anyPort,
    anyRequest
  );
  const callback = () => { };
  this.strategySendStub = sinon.stub(testStrategy, 'send');
  this.strategySendStub.withArgs(callback);
  this.strategyCancelStub = sinon.stub(testStrategy, 'cancel');
  this.strategyCancelStub.withArgs();

  this.sender = new Sender(anyHost, anyPort, anyRequest);

  // Stub out the lookupAll method to prevent network activity from doing a DNS
  // lookup. Succeeds or fails depending on lookupError.
  this.lookupAllStub = sinon.stub(this.sender, 'invokeLookupAll');
  this.lookupAllStub.callsArgWithAsync(1, lookupError, this.addresses);

  // Stub the create strategy method for the test to return a strategy object created
  // exactly like the method would but with a few methods stubbed.
  this.createStrategyStub = sinon.stub(
    this.sender,
    'createParallelSendStrategy'
  );
  this.createStrategyStub
    .withArgs(this.addresses, anyPort, anyRequest)
    .returns(testStrategy);

  this.sender.execute(callback);
}

describe('Sender send to hostnam', function() {
  describe('Send', function() {
    let glob;

    beforeEach(function() {
      // Set of IP addresses to be returned by stubbed out lookupAll method.
      glob = {
        addresses: [
          { address: '127.0.0.2' },
          { address: '2002:20:0:0:0:0:1:3' },
          { address: '127.0.0.4' }
        ]
      };
    });

    afterEach(function() {
      sinon.restore();
    });

    it('should send basic', function(done) {
      const lookupError = null;
      sendToHostCommonTestSetup.call(glob, lookupError);

      assert.isOk(glob.lookupAllStub.calledOnce);

      const validate = () => {
        assert.isOk(glob.createStrategyStub.calledOnce);
        assert.isOk(glob.strategySendStub.calledOnce);
        done();
      };

      process.nextTick(validate);
    });

    it('should send cancel', function(done) {
      const lookupError = null;
      sendToHostCommonTestSetup.call(glob, lookupError);

      assert.isOk(glob.lookupAllStub.calledOnce);

      const validate = () => {
        assert.isOk(glob.createStrategyStub.calledOnce);
        assert.isOk(glob.strategySendStub.calledOnce);

        glob.sender.cancel();
        assert.isOk(glob.strategyCancelStub.calledOnce);
        done();
      };

      process.nextTick(validate);
    });

    it('should look up error', function(done) {
      const lookupError = new Error('some error.');

      sendToHostCommonTestSetup.call(glob, lookupError);

      assert.isOk(glob.lookupAllStub.calledOnce);

      const validate = () => {
        // Strategy object should not be created on lookup error.
        assert.strictEqual(glob.createStrategyStub.callCount, 0);
        assert.strictEqual(glob.strategySendStub.callCount, 0);
        done();
      };

      process.nextTick(validate);
    });

    it('should send cancel on lookup error', function(done) {
      const lookupError = new Error('some error.');

      sendToHostCommonTestSetup.call(glob, lookupError);
      glob.sender.cancel();

      assert.isOk(glob.lookupAllStub.calledOnce);

      const validate = () => {
        // Strategy object should not be created on lookup error.
        assert.strictEqual(glob.createStrategyStub.callCount, 0);
        assert.strictEqual(glob.strategySendStub.callCount, 0);
        assert.strictEqual(glob.strategyCancelStub.callCount, 0);
        done();
      };

      process.nextTick(validate);
    });
  });

});

describe('Parallel Send Strategy', function() {
  describe('Send', function() {
    let glob;

    function commonStrategyTestSetup() {
      // IP addresses returned by DNS reverse lookup and passed to the Strategy.
      this.testData = [
        { address: '1.2.3.4', udpVersion: udpIpv4, family: 4 },
        { address: '2002:20:0:0:0:0:1:3', udpVersion: udpIpv6, family: 6 },
        { address: '2002:30:0:0:0:0:2:4', udpVersion: udpIpv6, family: 6 },
        { address: '5.6.7.8', udpVersion: udpIpv4, family: 4 }
      ];

      // Create sockets for IPv4 and IPv6 with send and close stubbed out to
      // prevent network activity.
      this.testSockets = {};
      this.testSockets[udpIpv4] = Dgram.createSocket(udpIpv4);
      this.testSockets[udpIpv6] = Dgram.createSocket(udpIpv6);

      for (const key in this.testSockets) {
        this.testSockets[key].socketSendStub = sinon.stub(this.testSockets[key], 'send').callsFake(sendStub);
        this.testSockets[key].socketCloseSpy = sinon.spy(this.testSockets[key], 'close');

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
      this.createSocketStub = sinon.stub(Dgram, 'createSocket');
      this.createSocketStub.withArgs(udpIpv4).returns(this.testSockets[udpIpv4]);
      this.createSocketStub.withArgs(udpIpv6).returns(this.testSockets[udpIpv6]);

      this.parallelSendStrategy = new ParallelSendStrategy(
        this.testData,
        anyPort,
        anyRequest
      );
    }

    function commonStrategyTestValidation(done) {
      for (const key in this.testSockets) {
        assert.strictEqual(this.testSockets[key].socketSendStub.callCount, 2);
        assert.strictEqual(this.testSockets[key].socketCloseSpy.callCount, 1);
      }

      assert.strictEqual(this.createSocketStub.callCount, 2);

      done();
    }

    beforeEach(function() {
      glob = {};
      commonStrategyTestSetup.call(glob);
    });

    afterEach(function() {
      for (const key in glob.testSockets) {
        glob.testSockets[key].socketSendStub.restore();
        glob.testSockets[key].socketCloseSpy.restore();
        glob.createSocketStub.restore();
      }
    });

    it('should send all IPs success', function(done) {
      glob.parallelSendStrategy.send((error, message) => {
        assert.strictEqual(error, null);

        // We should get the message only on the first socket, which is Ipv4.
        assert.strictEqual(glob.testData[0].udpVersion, udpIpv4);
        assert.strictEqual(message, glob.testSockets[udpIpv4]);
        commonStrategyTestValidation.call(glob, done);
      });
    });

    it('should send IPv4 fail', function(done) {
      // Setup sends to fail on Ipv4 socket.
      glob.testSockets[udpIpv4].sendResult = sendResultError;

      glob.parallelSendStrategy.send((error, message) => {
        // Even though the IPv4 socket sends fail, we should not get an error
        // as the other sockets succeed.
        assert.strictEqual(error, null);

        // We setup the IPv4 socket sends to fail. So we should get the message on the
        // Ipv6 socket.
        assert.strictEqual(message, glob.testSockets[udpIpv6]);

        commonStrategyTestValidation.call(glob, done);
      });
    });

    it('should send IPV6 fail', function(done) {
      // Setup sends to fail on Ipv6 socket.
      glob.testSockets[udpIpv6].sendResult = sendResultError;

      glob.parallelSendStrategy.send((error, message) => {
        // Even though the IPv6 socket sends fail, we should not get an error
        // as the other sockets succeed.
        assert.strictEqual(error, null);

        // We setup the IPv6 socket sends to fail. So we should get the message on the
        // Ipv4 socket.
        assert.strictEqual(message, glob.testSockets[udpIpv4]);

        commonStrategyTestValidation.call(glob, done);
      });
    });

    it('should send all IPs fail', function(done) {
      // Setup IPv4 and IPv6 sockets to fail on socket send.
      glob.testSockets[udpIpv4].sendResult = sendResultError;
      glob.testSockets[udpIpv6].sendResult = sendResultError;

      glob.parallelSendStrategy.send((error, message) => {
        // All socket sends fail. We should get an error on the last socket fail.
        assert.strictEqual(
          error,
          glob.testSockets[glob.testData[glob.testData.length - 1].udpVersion]
        );

        assert.strictEqual(message, undefined);

        commonStrategyTestValidation.call(glob, done);
      });
    });

    it('should send cancel', function(done) {
      glob.parallelSendStrategy.send((error, message) => {
        // We should not get a callback as the send got cancelled.
        assert.isOk(false, 'Should never get here.');
      });

      glob.parallelSendStrategy.cancel();

      commonStrategyTestValidation.call(glob, done);
    });
  });
});
