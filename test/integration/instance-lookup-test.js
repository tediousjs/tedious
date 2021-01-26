const fs = require('fs');
const InstanceLookup = require('../../src/instance-lookup').InstanceLookup;
const homedir = require('os').homedir();
const assert = require('chai').assert;
const AbortController = require('node-abort-controller');

var RESERVED_IP_ADDRESS = '192.0.2.0'; // Can never be used, so guaranteed to fail.

function getConfig() {
  return {
    server: JSON.parse(
      fs.readFileSync(
        homedir + '/.tedious/test-connection.json',
        'utf8'
      )
    ).config.server,
    instanceName: JSON.parse(
      fs.readFileSync(
        homedir + '/.tedious/test-connection.json',
        'utf8'
      )
    ).instanceName
  };
}

describe('Instance Lookup Test', function() {
  it('should test good instance', function(done) {
    var config = getConfig();

    if (!config.instanceName) {
      // Config says don't do this test (probably because SQL Server Browser is not available).
      return this.skip();
    }

    const controller = new AbortController();
    new InstanceLookup().instanceLookup({
      server: config.server,
      instanceName: config.instanceName,
      signal: controller.signal
    }, function(err, port) {
      if (err) {
        return done(err);
      }

      assert.ok(port);

      done();
    });
  });

  it('should test bad Instance', function(done) {
    var config = getConfig();

    const controller = new AbortController();
    new InstanceLookup().instanceLookup({
      server: config.server,
      instanceName: 'badInstanceName',
      timeout: 100,
      retries: 1,
      signal: controller.signal
    }, function(err, port) {
      assert.ok(err);
      assert.ok(!port);

      done();
    });
  });

  it('should test bad Server', function(done) {
    const controller = new AbortController();
    new InstanceLookup().instanceLookup({
      server: RESERVED_IP_ADDRESS,
      instanceName: 'badInstanceName',
      timeout: 100,
      retries: 1,
      signal: controller.signal
    }, function(err, port) {
      assert.ok(err);
      assert.ok(!port);

      done();
    });
  });
});
