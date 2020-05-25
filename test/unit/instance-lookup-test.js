const InstanceLookup = require('../../src/instance-lookup').InstanceLookup;
const sinon = require('sinon');
const punycode = require('punycode');
const assert = require('chai').assert;
const dgram = require('dgram');

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

describe('InstanceLookup', function() {
  let server;

  beforeEach(function(done) {
    server = dgram.createSocket('udp4');
    server.bind(0, '127.0.0.1', done);
  });

  afterEach(function(done) {
    server.close(done);
  });

  it('sends a request to the given server browser endpoint', function(done) {
    server.on('message', (msg) => {
      assert.deepEqual(msg, Buffer.from([0x02]));

      done();
    });

    new InstanceLookup().instanceLookup({
      server: server.address().address,
      port: server.address().port,
      instanceName: 'second',
      timeout: 500,
      retries: 1,
    }, () => {
      // Ignore
    });
  });

  describe('when not receiving a response', function(done) {
    it('times out after the given timeout period', function(done) {
      let timedOut = false;
      let errored = false;

      setTimeout(() => {
        timedOut = true;
      }, 500);

      setTimeout(() => {
        assert.isTrue(errored);
        done();
      }, 600);

      new InstanceLookup().instanceLookup({
        server: server.address().address,
        port: server.address().port,
        instanceName: 'instance',
        timeout: 500,
        retries: 1,
      }, (err) => {
        assert.isOk(err);
        assert.match(err, /^Failed to get response from SQL Server Browser/);
        assert.isTrue(timedOut);

        errored = true;
      });
    });
  });

  describe('when receiving a response before timing out', function() {
    it('returns the port for the instance with a matching name', function(done) {
      server.on('message', (msg, rinfo) => {
        const response = [
          'ServerName;WINDOWS2;InstanceName;first;IsClustered;No;Version;10.50.2500.0;tcp;1444;;',
          'ServerName;WINDOWS2;InstanceName;second;IsClustered;No;Version;10.50.2500.0;tcp;1433;;',
          'ServerName;WINDOWS2;InstanceName;third;IsClustered;No;Version;10.50.2500.0;tcp;1445;;'
        ].join('');

        server.send(response, rinfo.port, rinfo.address);
      });

      new InstanceLookup().instanceLookup({
        server: server.address().address,
        port: server.address().port,
        instanceName: 'second',
        timeout: 500,
        retries: 1,
      }, (err, result) => {
        assert.ifError(err);

        assert.strictEqual(result, 1433);

        done();
      });
    });
  });

  describe('when receiving a response that does not contain the requested instance name', function() {
    it('returns an error', function(done) {
      server.on('message', (msg, rinfo) => {
        const response = [
          'ServerName;WINDOWS2;InstanceName;first;IsClustered;No;Version;10.50.2500.0;tcp;1444;;',
          'ServerName;WINDOWS2;InstanceName;second;IsClustered;No;Version;10.50.2500.0;tcp;1433;;',
          'ServerName;WINDOWS2;InstanceName;third;IsClustered;No;Version;10.50.2500.0;tcp;1445;;'
        ].join('');

        server.send(response, rinfo.port, rinfo.address);
      });

      new InstanceLookup().instanceLookup({
        server: server.address().address,
        port: server.address().port,
        instanceName: 'other',
        timeout: 500,
        retries: 1,
      }, (err) => {
        assert.isOk(err);
        assert.match(err, /^Port for other not found/);

        done();
      });
    });
  });

  describe('when receiving an invalid response', function() {
    it('returns an error', function(done) {
      server.on('message', (msg, rinfo) => {
        server.send('foo bar baz', rinfo.port, rinfo.address);
      });

      new InstanceLookup().instanceLookup({
        server: server.address().address,
        port: server.address().port,
        instanceName: 'other',
        timeout: 500,
        retries: 1,
      }, (err) => {
        assert.isOk(err);
        assert.match(err, /^Port for other not found/);

        done();
      });
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
  it('test IDN Server name', (done) => {
    const lookup = sinon.spy(function lookup(hostname, options, callback) {
      callback([{ address: '127.0.0.1', family: 4 }]);
    });

    const options = {
      server: '本地主机.ad',
      instanceName: 'instance',
      timeout: 500,
      retries: 1,
      lookup: lookup
    };

    new InstanceLookup().instanceLookup(options, () => {
      sinon.assert.calledOnce(lookup);
      sinon.assert.calledWithMatch(lookup, punycode.toASCII(options.server));

      done();
    });
  });

  it('test ASCII Server name', (done) => {
    const lookup = sinon.spy(function lookup(hostname, options, callback) {
      callback([{ address: '127.0.0.1', family: 4 }]);
    });

    const options = {
      server: 'localhost',
      instanceName: 'instance',
      timeout: 500,
      retries: 1,
      lookup: lookup
    };

    new InstanceLookup().instanceLookup(options, (err) => {
      sinon.assert.calledOnce(lookup);
      sinon.assert.calledWithMatch(lookup, options.server);

      done();
    });
  });
});
