const InstanceLookup = require('../../src/instance-lookup').InstanceLookup;
const sinon = require('sinon');
const dns = require('dns');
const punycode = require('punycode');
const assert = require('chai').assert;

describe('instanceLookup invalid args', function() {
  let instanceLookup;

  beforeEach(function() {
    instanceLookup = new InstanceLookup();
  });

  it('invalid server', () => {
    assert.throws(() => {
      instanceLookup.instanceLookup({ server: 4 });
    }, 'Invalid arguments: "server" must be a string');
  });

  it('invalid instanceName', () => {
    assert.throws(() => {
      instanceLookup.instanceLookup({ server: 'serverName', instanceName: 4 });
    }, 'Invalid arguments: "instanceName" must be a string');
  });

  it('invalid timeout', () => {
    assert.throws(() => {
      instanceLookup.instanceLookup({
        server: 'server',
        instanceName: 'instance',
        timeout: 'some string'
      });
    }, 'Invalid arguments: "timeout" must be a number');
  });

  it('invalid retries', () => {
    assert.throws(() => {
      instanceLookup.instanceLookup({
        server: 'server',
        instanceName: 'instance',
        timeout: 1000,
        retries: 'some string'
      });
    }, 'Invalid arguments: "retries" must be a number');
  });

  it('invalid callback', () => {
    assert.throws(() => {
      instanceLookup.instanceLookup({
        server: 'server',
        instanceName: 'instance',
        timeout: 1000,
        retries: 3
      }, 4);
    }, 'Invalid arguments: "callback" must be a function');
  });
});

describe('instanceLookup functional unit tests', function() {

  let options;
  let anyPort;
  let anyRequest;
  let anyMessage;
  let anyError;
  let anySqlPort;
  let instanceLookup;
  let testSender;
  let createSenderStub;
  let senderExecuteStub;
  let parseStub;


  beforeEach(function() {
    options = {
      server: 'server',
      instanceName: 'instance',
      timeout: 1000,
      retries: 3
    };

    anyPort = 1234;
    anyRequest = Buffer.alloc(0x02);
    anyMessage = 'any message';
    anyError = new Error('any error');
    anySqlPort = 2345;

    instanceLookup = new InstanceLookup();

    // Stub out createSender method to return the Sender we create. This allows us
    // to override the execute method on Sender so we can test instance lookup code
    // without triggering network activity.
    testSender = instanceLookup.createSender(
      options.server,
      anyPort,
      anyRequest
    );
    createSenderStub = sinon.stub(
      instanceLookup,
      'createSender'
    );
    createSenderStub.returns(testSender);
    senderExecuteStub = sinon.stub(testSender, 'execute');

    // Stub parseBrowserResponse so we can mimic success and failure without creating
    // elaborate responses. parseBrowserResponse itself has unit tests to ensure that
    // it functions correctly.
    parseStub = sinon.stub(
      instanceLookup,
      'parseBrowserResponse'
    );
  });

  afterEach(function() {
    sinon.restore();
  }),

  it('success', (done) => {
    senderExecuteStub.callsArgWithAsync(0, null, anyMessage);
    parseStub
      .withArgs(anyMessage, options.instanceName)
      .returns(anySqlPort);

    instanceLookup.instanceLookup(options, (error, port) => {
      assert.strictEqual(error, undefined);
      assert.strictEqual(port, anySqlPort);

      assert.ok(createSenderStub.calledOnce);
      assert.strictEqual(createSenderStub.args[0][0], options.server);
      assert.strictEqual(createSenderStub.args[0][3]);

      assert.ok(senderExecuteStub.calledOnce);
      assert.ok(parseStub.calledOnce);

      done();
    });
  }),

  it('sender fail', (done) => {
    senderExecuteStub.callsArgWithAsync(0, anyError, undefined);

    instanceLookup.instanceLookup(options, (error, port) => {
      assert.ok(error.indexOf(anyError.message) !== -1);
      assert.strictEqual(port, undefined);

      assert.ok(createSenderStub.calledOnce);
      assert.strictEqual(createSenderStub.args[0][0], options.server);
      assert.strictEqual(createSenderStub.args[0][3]);

      assert.ok(senderExecuteStub.calledOnce);
      assert.strictEqual(parseStub.callCount, 0);

      done();
    });
  }),

  it('parse fail', (done) => {
    senderExecuteStub.callsArgWithAsync(0, null, anyMessage);
    parseStub
      .withArgs(anyMessage, options.instanceName)
      .returns(null);

    instanceLookup.instanceLookup(options, (error, port) => {
      assert.ok(error.indexOf('not found') !== -1);
      assert.strictEqual(port, undefined);

      assert.ok(createSenderStub.calledOnce);
      assert.strictEqual(createSenderStub.args[0][0], options.server);
      assert.strictEqual(createSenderStub.args[0][3]);

      assert.ok(senderExecuteStub.calledOnce);
      assert.ok(parseStub.calledOnce);

      done();
    });
  }),

  it('retry success', (done) => {
    // First invocation of execute will not invoke callback. This will cause a timeout
    // and trigger a retry. Setup to invoke callback on second invocation.
    senderExecuteStub
      .onCall(1)
      .callsArgWithAsync(0, null, anyMessage);
    parseStub
      .withArgs(anyMessage, options.instanceName)
      .returns(anySqlPort);

    const clock = sinon.useFakeTimers();

    instanceLookup.instanceLookup(options, (error, port) => {
      assert.strictEqual(error, undefined);
      assert.strictEqual(port, anySqlPort);

      assert.ok(createSenderStub.callCount, 2);
      for (let j = 0; j < createSenderStub.callCount; j++) {
        assert.strictEqual(createSenderStub.args[j][0], options.server);
        assert.strictEqual(createSenderStub.args[j][3]);
      }

      // Execute called twice but parse only called once as the first call to execute times out.
      assert.strictEqual(senderExecuteStub.callCount, 2);
      assert.ok(parseStub.calledOnce);

      clock.restore();

      done();
    });

    // Forward clock to trigger timeout.
    clock.tick(options.timeout * 1.1);
  }),

  it('retry fail', (done) => {
    const clock = sinon.useFakeTimers();

    const forwardClock = () => {
      clock.tick(options.timeout * 1.1);
    };

    function scheduleForwardClock() {
      // This function is called in place of sender.execute(). We don't want to
      // rely on when the timeout is set in relation to execute() in the calling
      // context. So we setup to forward clock on next tick.
      process.nextTick(forwardClock);
    }

    senderExecuteStub.restore();
    senderExecuteStub = sinon.stub(
      testSender,
      'execute',
    ).callsFake(scheduleForwardClock);

    instanceLookup.instanceLookup(options, (error, port) => {
      assert.ok(error.indexOf('Failed to get response') !== -1);
      assert.strictEqual(port, undefined);

      assert.strictEqual(createSenderStub.callCount, options.retries);
      for (let j = 0; j < createSenderStub.callCount; j++) {
        assert.strictEqual(createSenderStub.args[j][0], options.server);
        assert.strictEqual(createSenderStub.args[j][3]);
      }

      // Execute called 'retries' number of times but parse is never called because
      // all the execute calls timeout.
      assert.strictEqual(senderExecuteStub.callCount, options.retries);
      assert.strictEqual(parseStub.callCount, 0);

      clock.restore();

      done();
    });
  }),

  it('incorrect instanceName', (done) => {
    const message = 'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;' +
      'ServerName;WINDOWS2;InstanceName;YYYYYYYYYY;IsClustered;No;Version;10.50.2500.0;tcp;0;;';
    senderExecuteStub.callsArgWithAsync(0, null, message);
    parseStub
      .withArgs(message, options.instanceName);

    instanceLookup.instanceLookup(options, (error, port) => {
      assert.ok(error.indexOf('XXXXXXXXXX') === -1);
      assert.ok(error.indexOf('YYYYYYYYYY') === -1);
      assert.strictEqual(port, undefined);

      assert.ok(createSenderStub.calledOnce);
      assert.ok(senderExecuteStub.calledOnce);
      assert.ok(parseStub.calledOnce);

      done();
    });
  });
});

describe('parseBrowserResponse', function() {
  let instanceLookup;

  beforeEach(function() {
    instanceLookup = new InstanceLookup();
  });

  it('oneInstanceFound', () => {
    const response =
      'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;';

    assert.strictEqual(instanceLookup.parseBrowserResponse(response, 'sqlexpress'), 1433);
  });

  it('twoInstancesFoundInFirst', () => {
    const response =
      'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;' +
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;';

    assert.strictEqual(instanceLookup.parseBrowserResponse(response, 'sqlexpress'), 1433);
  });

  it('twoInstancesFoundInSecond', () => {
    const response =
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;' +
      'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;';

    assert.strictEqual(instanceLookup.parseBrowserResponse(response, 'sqlexpress'), 1433);
  });

  it('twoInstancesNotFound', () => {
    const response =
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;' +
      'ServerName;WINDOWS2;InstanceName;YYYYYYYYYY;IsClustered;No;Version;10.50.2500.0;tcp;0;;';

    assert.strictEqual(instanceLookup.parseBrowserResponse(response, 'sqlexpress'), undefined);
  });
});

describe('parseBrowserResponse', function() {
  let spy;

  beforeEach(function() {
    spy = sinon.spy(dns, 'lookup');
  });

  afterEach(function() {
    sinon.restore();
  });

  it('test IDN Server name', (done) => {
    const options = {
      server: '本地主机.ad',
      instanceName: 'instance',
      timeout: 500,
      retries: 1
    };

    new InstanceLookup().instanceLookup(options, () => {
      assert.ok(spy.called, 'Failed to call dns.lookup on hostname');
      assert.ok(spy.calledWithMatch(punycode.toASCII(options.server)), 'Unexpected hostname passed to dns.lookup');

      done();
    });
  });

  it('test ASCII Server name', (done) => {
    const options = {
      server: 'localhost',
      instanceName: 'instance',
      timeout: 500,
      retries: 1
    };

    new InstanceLookup().instanceLookup(options, () => {
      assert.ok(spy.called, 'Failed to call dns.lookup on hostname');
      assert.ok(spy.calledWithMatch(options.server), 'Unexpected hostname passed to dns.lookup');

      done();
    });
  });
});
