const sinon = require('sinon');
const url = require('node:url');
const assert = require('chai').assert;
const dgram = require('dgram');

const { instanceLookup, parseBrowserResponse } = require('../../src/instance-lookup');

describe('instanceLookup invalid args', function() {
  it('invalid server', async function() {
    let error;
    try {
      await instanceLookup({ server: 4 });
    } catch (err) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error.message, 'Invalid arguments: "server" must be a string');
  });

  it('invalid instanceName', async function() {
    let error;
    try {
      await instanceLookup({ server: 'serverName', instanceName: 4 });
    } catch (err) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error.message, 'Invalid arguments: "instanceName" must be a string');
  });

  it('invalid timeout', async function() {
    let error;
    try {
      await instanceLookup({
        server: 'server',
        instanceName: 'instance',
        timeout: 'some string'
      });
    } catch (err) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error.message, 'Invalid arguments: "timeout" must be a number');
  });

  it('invalid retries', async function() {
    let error;
    try {
      await instanceLookup({
        server: 'server',
        instanceName: 'instance',
        timeout: 1000,
        retries: 'some string'
      });
    } catch (err) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error.message, 'Invalid arguments: "retries" must be a number');
  });
});

describe('InstanceLookup', function() {
  /**
   * @type {dgram.Socket}
   */
  let server;

  beforeEach(function(done) {
    server = dgram.createSocket('udp4');
    server.bind(0, '127.0.0.1', done);
  });

  afterEach(function(done) {
    server.close(done);
  });

  it('sends a request to the given server browser endpoint', async function() {
    server.on('message', (msg) => {
      assert.deepEqual(msg, Buffer.from([0x02]));
    });

    const controller = new AbortController();

    try {
      await instanceLookup({
        server: server.address().address,
        port: server.address().port,
        instanceName: 'second',
        timeout: 500,
        retries: 1,
        signal: controller.signal
      });
    } catch {
      // Ignore
    }
  });

  it('can be aborted immediately', async function() {
    server.on('message', (msg, rinfo) => {
      assert.fail('expected no message to be received');
    });

    const controller = new AbortController();
    controller.abort();

    let error;
    try {
      await instanceLookup({
        server: server.address().address,
        port: server.address().port,
        instanceName: 'first',
        timeout: 500,
        retries: 1,
        signal: controller.signal
      });
    } catch (err) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error.name, 'AbortError');
  });

  it('can be aborted after sending the first request', async function() {
    server.on('message', (msg, rinfo) => {
      if (controller.signal.aborted) {
        assert.fail('expected no message to be received');
      }

      controller.abort();
    });

    const controller = new AbortController();

    let error;
    try {
      await instanceLookup({
        server: server.address().address,
        port: server.address().port,
        instanceName: 'first',
        timeout: 500,
        retries: 1,
        signal: controller.signal
      });
    } catch (err) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error.name, 'AbortError');
  });

  it('can be aborted after retrying to send a request', async function() {
    server.once('message', () => {
      server.on('message', (msg, rinfo) => {
        if (controller.signal.aborted) {
          assert.fail('expected no message to be received');
        }

        controller.abort();
      });
    });

    const controller = new AbortController();

    let error;
    try {
      await instanceLookup({
        server: server.address().address,
        port: server.address().port,
        instanceName: 'first',
        timeout: 500,
        retries: 1,
        signal: controller.signal
      });
    } catch (err) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error.name, 'AbortError');
  });

  describe('when not receiving a response', function() {
    it('times out after the given timeout period', async function() {
      const controller = new AbortController();

      const timeBefore = process.hrtime();

      let error;
      try {
        await instanceLookup({
          server: server.address().address,
          port: server.address().port,
          instanceName: 'instance',
          timeout: 500,
          retries: 0,
          signal: controller.signal
        });
      } catch (err) {
        error = err;
      }

      const timeDiff = process.hrtime(timeBefore);

      assert.instanceOf(error, Error);
      assert.match(error.message, /^Failed to get response from SQL Server Browser/);

      assert.approximately(500000000, timeDiff[1], 100000000);
    });
  });

  describe('when receiving a response before timing out', function() {
    it('returns the port for the instance with a matching name', async function() {
      server.on('message', (msg, rinfo) => {
        const response = [
          'ServerName;WINDOWS2;InstanceName;first;IsClustered;No;Version;10.50.2500.0;tcp;1444;;',
          'ServerName;WINDOWS2;InstanceName;second;IsClustered;No;Version;10.50.2500.0;tcp;1433;;',
          'ServerName;WINDOWS2;InstanceName;third;IsClustered;No;Version;10.50.2500.0;tcp;1445;;'
        ].join('');

        server.send(response, rinfo.port, rinfo.address);
      });

      const controller = new AbortController();

      const result = await instanceLookup({
        server: server.address().address,
        port: server.address().port,
        instanceName: 'second',
        timeout: 500,
        retries: 1,
        signal: controller.signal
      });

      assert.strictEqual(result, 1433);
    });
  });

  describe('when receiving a response that does not contain the requested instance name', function() {
    it('throws an error', async function() {
      server.on('message', (msg, rinfo) => {
        const response = [
          'ServerName;WINDOWS2;InstanceName;first;IsClustered;No;Version;10.50.2500.0;tcp;1444;;',
          'ServerName;WINDOWS2;InstanceName;second;IsClustered;No;Version;10.50.2500.0;tcp;1433;;',
          'ServerName;WINDOWS2;InstanceName;third;IsClustered;No;Version;10.50.2500.0;tcp;1445;;'
        ].join('');

        server.send(response, rinfo.port, rinfo.address);
      });

      const controller = new AbortController();

      let error;
      try {
        await instanceLookup({
          server: server.address().address,
          port: server.address().port,
          instanceName: 'other',
          timeout: 500,
          retries: 1,
          signal: controller.signal
        });
      } catch (err) {
        error = err;
      }

      assert.instanceOf(error, Error);
      assert.match(error.message, /^Port for other not found/);
    });
  });

  describe('when receiving an invalid response', function() {
    it('throws an error', async function() {
      server.on('message', (msg, rinfo) => {
        server.send('foo bar baz', rinfo.port, rinfo.address);
      });

      const controller = new AbortController();

      let error;
      try {
        await instanceLookup({
          server: server.address().address,
          port: server.address().port,
          instanceName: 'other',
          timeout: 500,
          retries: 1,
          signal: controller.signal
        });
      } catch (err) {
        error = err;
      }

      assert.instanceOf(error, Error);
      assert.match(error.message, /^Port for other not found/);
    });
  });
});

describe('parseBrowserResponse', function() {
  it('oneInstanceFound', () => {
    const response =
      'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;';

    assert.strictEqual(parseBrowserResponse(response, 'sqlexpress'), 1433);
  });

  it('twoInstancesFoundInFirst', () => {
    const response =
      'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;' +
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;';

    assert.strictEqual(parseBrowserResponse(response, 'sqlexpress'), 1433);
  });

  it('twoInstancesFoundInSecond', () => {
    const response =
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;' +
      'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;';

    assert.strictEqual(parseBrowserResponse(response, 'sqlexpress'), 1433);
  });

  it('twoInstancesNotFound', () => {
    const response =
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;' +
      'ServerName;WINDOWS2;InstanceName;YYYYYYYYYY;IsClustered;No;Version;10.50.2500.0;tcp;0;;';

    assert.strictEqual(parseBrowserResponse(response, 'sqlexpress'), undefined);
  });
});

describe('parseBrowserResponse', function() {
  it('test IDN Server name', async function() {
    const lookup = sinon.spy(function lookup(hostname, options, callback) {
      callback(null, [{ address: '127.0.0.1', family: 4 }]);
    });

    const controller = new AbortController();

    const options = {
      server: '本地主机.ad',
      instanceName: 'instance',
      timeout: 500,
      retries: 0,
      lookup: lookup,
      signal: controller.signal
    };

    try {
      await instanceLookup(options);
    } catch {
      // ignore
    }

    sinon.assert.calledOnce(lookup);
    sinon.assert.calledWithMatch(lookup, url.domainToASCII(options.server));
  });

  it('test ASCII Server name', async function() {
    const lookup = sinon.spy(function lookup(hostname, options, callback) {
      callback(null, [{ address: '127.0.0.1', family: 4 }]);
    });

    const controller = new AbortController();

    const options = {
      server: 'localhost',
      instanceName: 'instance',
      timeout: 500,
      retries: 0,
      lookup: lookup,
      signal: controller.signal
    };

    try {
      await instanceLookup(options);
    } catch {
      // ignore
    }

    sinon.assert.calledOnce(lookup);
    sinon.assert.calledWithMatch(lookup, options.server);
  });
});
