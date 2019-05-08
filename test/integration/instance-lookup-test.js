var fs = require('fs');
var InstanceLookup = require('../../src/instance-lookup').InstanceLookup;
const homedir = require('os').homedir();

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

exports.goodInstance = function(test) {
  var config = getConfig();

  if (!config.instanceName) {
    // Config says don't do this test (probably because SQL Server Browser is not available).
    console.log('Skipping goodInstance test');
    test.done();
    return;
  }

  new InstanceLookup().instanceLookup({ server: config.server, instanceName: config.instanceName }, function(err, port) {
    test.ifError(err);
    test.ok(port);

    test.done();
  });
};

exports.badInstance = function(test) {
  var config = getConfig();

  new InstanceLookup().instanceLookup({
    server: config.server,
    instanceName: 'badInstanceName',
    timeout: 100,
    retries: 1
  }, function(err, port) {
    test.ok(err);
    test.ok(!port);

    test.done();
  });
};

exports.badServer = function(test) {
  new InstanceLookup().instanceLookup({
    server: RESERVED_IP_ADDRESS,
    instanceName: 'badInstanceName',
    timeout: 100,
    retries: 1
  }, function(err, port) {
    test.ok(err);
    test.ok(!port);

    test.done();
  });
};
