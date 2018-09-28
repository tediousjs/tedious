const InstanceLookup = require('../../src/instance-lookup').InstanceLookup;
const Sinon = require('sinon');
const dns = require('dns');
const punycode = require('punycode');

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
    const expectedErrorMessage =
      'Invalid arguments: "instanceName" must be a string';
    try {
      const notString = 4;
      this.instanceLookup({ server: 'serverName', instanceName: notString });
    } catch (err) {
      test.strictEqual(err.message, expectedErrorMessage);
      test.done();
    }
  },

  'invalid timeout': function(test) {
    const expectedErrorMessage =
      'Invalid arguments: "timeout" must be a number';
    try {
      const notNumber = 'some string';
      this.instanceLookup({
        server: 'server',
        instanceName: 'instance',
        timeout: notNumber
      });
    } catch (err) {
      test.strictEqual(err.message, expectedErrorMessage);
      test.done();
    }
  },

  'invalid callback': function(test) {
    const expectedErrorMessage =
      'Invalid arguments: "callback" must be a function';
    try {
      const notFunction = 4;
      this.instanceLookup(
        {
          server: 'server',
          instanceName: 'instance',
          timeout: 1000
        },
        notFunction
      );
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
      timeout: 1000
    };

    this.anyPort = 1234;
    this.anyRequest = Buffer.alloc(0x02);
    this.anyMessage = 'any message';
    this.anyError = new Error('any error');
    this.anySqlPort = 2345;

    this.instanceLookup = new InstanceLookup();

    // Stub out createSender method to return the Sender we create. This allows us
    // to override the execute method on Sender so we can test instance lookup code
    // without triggering network activity.
    this.testSender = this.instanceLookup.createSender(
      this.options.server,
      this.anyPort,
      this.anyRequest
    );
    this.createSenderStub = this.sinon.stub(
      this.instanceLookup,
      'createSender'
    );
    this.createSenderStub.returns(this.testSender);
    this.senderExecuteStub = this.sinon.stub(this.testSender, 'execute');

    // Stub parseBrowserResponse so we can mimic success and failure without creating
    // elaborate responses. parseBrowserResponse itself has unit tests to ensure that
    // it functions correctly.
    this.parseStub = this.sinon.stub(
      this.instanceLookup,
      'parseBrowserResponse'
    );

    done();
  },

  tearDown: function(done) {
    this.sinon.restore();
    done();
  },

  success: function(test) {
    this.senderExecuteStub.callsArgWithAsync(0, null, this.anyMessage);
    this.parseStub
      .withArgs(this.anyMessage, this.options.instanceName)
      .returns(this.anySqlPort);

    this.instanceLookup.instanceLookup(this.options, (error, port) => {
      test.strictEqual(error, undefined);
      test.strictEqual(port, this.anySqlPort);

      test.ok(this.createSenderStub.calledOnce);
      test.strictEqual(this.createSenderStub.args[0][0], this.options.server);
      test.strictEqual(this.createSenderStub.args[0][3]);

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
      test.strictEqual(this.createSenderStub.args[0][3]);

      test.ok(this.senderExecuteStub.calledOnce);
      test.strictEqual(this.parseStub.callCount, 0);
      test.done();
    });
  },

  'parse fail': function(test) {
    this.senderExecuteStub.callsArgWithAsync(0, null, this.anyMessage);
    this.parseStub
      .withArgs(this.anyMessage, this.options.instanceName)
      .returns(null);

    this.instanceLookup.instanceLookup(this.options, (error, port) => {
      test.ok(error.indexOf('not found') !== -1);
      test.strictEqual(port, undefined);

      test.ok(this.createSenderStub.calledOnce);
      test.strictEqual(this.createSenderStub.args[0][0], this.options.server);
      test.strictEqual(this.createSenderStub.args[0][3]);

      test.ok(this.senderExecuteStub.calledOnce);
      test.ok(this.parseStub.calledOnce);
      test.done();
    });
  },

  'incorrect instanceName': function(test) {
    const message = 'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;' +
      'ServerName;WINDOWS2;InstanceName;YYYYYYYYYY;IsClustered;No;Version;10.50.2500.0;tcp;0;;';
    this.senderExecuteStub.callsArgWithAsync(0, null, message);
    this.parseStub
      .withArgs(message, this.options.instanceName);

    this.instanceLookup.instanceLookup(this.options, (error, port) => {
      test.ok(error.indexOf('XXXXXXXXXX') == -1);
      test.ok(error.indexOf('YYYYYYYYYY') == -1);
      test.strictEqual(port, undefined);

      test.ok(this.createSenderStub.calledOnce);
      test.ok(this.senderExecuteStub.calledOnce);
      test.ok(this.parseStub.calledOnce);
      test.done();
    });
  }
};

exports['parseBrowserResponse'] = {
  setUp: function(done) {
    this.parse = new InstanceLookup().parseBrowserResponse;
    done();
  },

  oneInstanceFound: function(test) {
    const response =
      'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;';

    test.strictEqual(this.parse(response, 'sqlexpress'), 1433);
    test.done();
  },

  twoInstancesFoundInFirst: function(test) {
    const response =
      'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;' +
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;';

    test.strictEqual(this.parse(response, 'sqlexpress'), 1433);
    test.done();
  },

  twoInstancesFoundInSecond: function(test) {
    const response =
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;' +
      'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;';

    test.strictEqual(this.parse(response, 'sqlexpress'), 1433);
    test.done();
  },

  twoInstancesNotFound: function(test) {
    const response =
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;' +
      'ServerName;WINDOWS2;InstanceName;YYYYYYYYYY;IsClustered;No;Version;10.50.2500.0;tcp;0;;';

    test.strictEqual(this.parse(response, 'sqlexpress'), undefined);
    test.done();
  }
};

exports['Test unicode SQL Server name'] = {
  setUp: function(done) {
    this.sinon = Sinon.sandbox.create();

    // Spy the dns.lookup so we can verify if it receives punycode value for IDN Server names
    this.spy = this.sinon.spy(dns, 'lookup');

    done();
  },

  tearDown: function(done) {
    this.sinon.restore();

    done();
  },

  'test IDN Server name': function(test) {
    test.expect(2);
    const options = {
      server: '本地主机.ad',
      instanceName: 'instance',
    };
    new InstanceLookup().instanceLookup(options, () => { });
    test.ok(this.spy.called, 'Failed to call dns.lookup on hostname');
    test.ok(this.spy.calledWithMatch(punycode.toASCII(options.server)), 'Unexpcted hostname passed to dns.lookup');
    test.done();
  },

  'test ASCII Server name': function(test) {
    test.expect(2);
    const options = {
      server: 'localhost',
      instanceName: 'instance',
    };
    new InstanceLookup().instanceLookup(options, () => { });
    test.ok(this.spy.called, 'Failed to call dns.lookup on hostname');
    test.ok(this.spy.calledWithMatch(options.server), 'Unexpcted hostname passed to dns.lookup');
    test.done();
  }
};
