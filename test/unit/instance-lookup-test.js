'use strict';

const InstanceLookup = require('../../src/instance-lookup').InstanceLookup;
const Sinon = require('sinon');

exports['instanceLookup invalid args'] = {
  setUp: function(done) {
    this.instanceLookup = new InstanceLookup().instanceLookup;
    done();
  },

  'invalid server': function(test) {
    const expectedErrorMessage = 'Invalid arguments: "server" must be a string';
    try {
      const notString = 4;
      this.instanceLookup({ server: notString });
    } catch (err) {
      test.strictEqual(err.message, expectedErrorMessage);
      test.done();
    }
  },

  'invalid instanceName': function(test) {
    const expectedErrorMessage = 'Invalid arguments: "instanceName" must be a string';
    try {
      const notString = 4;
      this.instanceLookup({ server: 'serverName', instanceName: notString });
    } catch (err) {
      test.strictEqual(err.message, expectedErrorMessage);
      test.done();
    }
  },

  'invalid timeout': function(test) {
    const expectedErrorMessage = 'Invalid arguments: "timeout" must be a number';
    try {
      const notNumber = 'some string';
      this.instanceLookup({ server: 'server', instanceName: 'instance', timeout: notNumber });
    } catch (err) {
      test.strictEqual(err.message, expectedErrorMessage);
      test.done();
    }
  },

  'invalid retries': function(test) {
    const expectedErrorMessage = 'Invalid arguments: "retries" must be a number';
    try {
      const notNumber = 'some string';
      this.instanceLookup({ server: 'server', instanceName: 'instance', timeout: 1000, retries: notNumber });
    } catch (err) {
      test.strictEqual(err.message, expectedErrorMessage);
      test.done();
    }
  },

  'invalid callback': function(test) {
    const expectedErrorMessage = 'Invalid arguments: "callback" must be a function';
    try {
      const notFunction = 4;
      this.instanceLookup({ server: 'server', instanceName: 'instance', timeout: 1000, retries: 3 }, notFunction);
    } catch (err) {
      test.strictEqual(err.message, expectedErrorMessage);
      test.done();
    }
  }
};


exports['instanceLookup functional unit tests'] = {
  setUp: function(done) {
    this.sinon = Sinon.sandbox.create();

    this.options = {
      server: 'server',
      instanceName: 'instance',
      timeout: 1000,
      retries: 3,
      multiSubnetFailover: true
    };

    this.anyPort = 1234;
    this.anyRequest = new Buffer(0x02);
    this.anyMessage = 'any message';
    this.anyError = new Error('any error');
    this.anySqlPort = 2345;

    this.instanceLookup = new InstanceLookup();

    // Stub out createSender method to return the Sender we create. This allows us
    // to override the execute method on Sender so we can test instance lookup code
    // without triggering network activity.
    this.testSender = this.instanceLookup.createSender(
      this.options.server, this.anyPort, this.anyRequest, this.options.multiSubnetFailover);
    this.createSenderStub = this.sinon.stub(this.instanceLookup, 'createSender');
    this.createSenderStub.returns(this.testSender);
    this.senderExecuteStub = this.sinon.stub(this.testSender, 'execute');

    // Stub parseBrowserResponse so we can mimic success and failure without creating
    // elaborate responses. parseBrowserResponse itself has unit tests to ensure that
    // it functions correctly.
    this.parseStub = this.sinon.stub(this.instanceLookup, 'parseBrowserResponse');

    done();
  },

  tearDown: function(done) {
    this.sinon.restore();
    done();
  },

  'success': function(test) {
    this.senderExecuteStub.callsArgWithAsync(0, null, this.anyMessage);
    this.parseStub.withArgs(this.anyMessage, this.options.instanceName).returns(this.anySqlPort);

    this.instanceLookup.instanceLookup(this.options, (error, port) => {
      test.strictEqual(error, undefined);
      test.strictEqual(port, this.anySqlPort);

      test.ok(this.createSenderStub.calledOnce);
      test.strictEqual(this.createSenderStub.args[0][0], this.options.server);
      test.strictEqual(this.createSenderStub.args[0][3], this.options.multiSubnetFailover);

      test.ok(this.senderExecuteStub.calledOnce);
      test.ok(this.parseStub.calledOnce);
      test.done();
    });
  },

  'sender fail': function(test) {
    this.senderExecuteStub.callsArgWithAsync(0, this.anyError, undefined);

    this.instanceLookup.instanceLookup(this.options, (error, port) => {
      test.ok(error.indexOf(this.anyError.message) !== -1);
      test.strictEqual(port, undefined);

      test.ok(this.createSenderStub.calledOnce);
      test.strictEqual(this.createSenderStub.args[0][0], this.options.server);
      test.strictEqual(this.createSenderStub.args[0][3], this.options.multiSubnetFailover);

      test.ok(this.senderExecuteStub.calledOnce);
      test.strictEqual(this.parseStub.callCount, 0);
      test.done();
    });
  },

  'parse fail': function(test) {
    this.senderExecuteStub.callsArgWithAsync(0, null, this.anyMessage);
    this.parseStub.withArgs(this.anyMessage, this.options.instanceName).returns(null);

    this.instanceLookup.instanceLookup(this.options, (error, port) => {
      test.ok(error.indexOf('not found') !== -1);
      test.strictEqual(port, undefined);

      test.ok(this.createSenderStub.calledOnce);
      test.strictEqual(this.createSenderStub.args[0][0], this.options.server);
      test.strictEqual(this.createSenderStub.args[0][3], this.options.multiSubnetFailover);

      test.ok(this.senderExecuteStub.calledOnce);
      test.ok(this.parseStub.calledOnce);
      test.done();
    });
  },

  'retry success': function(test) {
    // First invocation of execute will not invoke callback. This will cause a timeout
    // and trigger a retry. Setup to invoke callback on second invocation.
    this.senderExecuteStub.onCall(1).callsArgWithAsync(0, null, this.anyMessage);
    this.parseStub.withArgs(this.anyMessage, this.options.instanceName).returns(this.anySqlPort);

    const clock = this.sinon.useFakeTimers();

    this.instanceLookup.instanceLookup(this.options, (error, port) => {
      test.strictEqual(error, undefined);
      test.strictEqual(port, this.anySqlPort);

      test.ok(this.createSenderStub.callCount, 2);
      for (let j = 0; j < this.createSenderStub.callCount; j++) {
        test.strictEqual(this.createSenderStub.args[j][0], this.options.server);
        test.strictEqual(this.createSenderStub.args[j][3], this.options.multiSubnetFailover);
      }

      // Execute called twice but parse only called once as the first call to execute times out.
      test.strictEqual(this.senderExecuteStub.callCount, 2);
      test.ok(this.parseStub.calledOnce);

      clock.restore();
      test.done();
    });

    // Forward clock to trigger timeout.
    clock.tick(this.options.timeout * 1.1);
  },

  'retry fail': function(test) {
    const clock = this.sinon.useFakeTimers();

    const forwardClock = () => {
      clock.tick(this.options.timeout * 1.1);
    };

    const scheduleForwardClock = function() {
      // This function is called in place of sender.execute(). We don't want to
      // rely on when the timeout is set in relation to execute() in the calling
      // context. So we setup to forward clock on next tick.
      process.nextTick(forwardClock);
    };

    this.senderExecuteStub.restore();
    this.senderExecuteStub = this.sinon.stub(this.testSender, 'execute', scheduleForwardClock);

    this.instanceLookup.instanceLookup(this.options, (error, port) => {
      test.ok(error.indexOf('Failed to get response') != -1);
      test.strictEqual(port, undefined);

      test.strictEqual(this.createSenderStub.callCount, this.options.retries);
      for (let j = 0; j < this.createSenderStub.callCount; j++) {
        test.strictEqual(this.createSenderStub.args[j][0], this.options.server);
        test.strictEqual(this.createSenderStub.args[j][3], this.options.multiSubnetFailover);
      }

      // Execute called 'retries' number of times but parse is never called because
      // all the execute calls timeout.
      test.strictEqual(this.senderExecuteStub.callCount, this.options.retries);
      test.strictEqual(this.parseStub.callCount, 0);

      clock.restore();
      test.done();
    });
  }
};

exports['parseBrowserResponse'] = {
  setUp: function(done) {
    this.parse = new InstanceLookup().parseBrowserResponse;
    done();
  },

  'oneInstanceFound': function(test) {
    const response = 'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;';

    test.strictEqual(this.parse(response, 'sqlexpress'), 1433);
    test.done();
  },

  'twoInstancesFoundInFirst': function(test) {
    const response =
      'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;' +
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;';

    test.strictEqual(this.parse(response, 'sqlexpress'), 1433);
    test.done();
  },

  'twoInstancesFoundInSecond': function(test) {
    const response =
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;' +
      'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;';

    test.strictEqual(this.parse(response, 'sqlexpress'), 1433);
    test.done();
  },

  'twoInstancesNotFound': function(test) {
    const response =
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;' +
      'ServerName;WINDOWS2;InstanceName;YYYYYYYYYY;IsClustered;No;Version;10.50.2500.0;tcp;0;;';

    test.strictEqual(this.parse(response, 'sqlexpress'), undefined);
    test.done();
  }
};

