'use strict';

var RESERVED_IP_ADDRESS, fs, getConfig, instanceLookup;

fs = require('fs');

instanceLookup = require('../../src/instance-lookup').instanceLookup;

RESERVED_IP_ADDRESS = '192.0.2.0';

getConfig = function() {
  return {
    server: JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config.server,
    instanceName: JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).instanceName
  };
};

exports.goodInstance = function(test) {
  var callback, config;
  config = getConfig();
  if (!config.instanceName) {
    console.log('Skipping goodInstance test');
    test.done();
    return;
  }
  callback = function(err, port) {
    test.ifError(err);
    test.ok(port);
    return test.done();
  };
  return instanceLookup(config.server, config.instanceName, callback);
};

exports.badInstance = function(test) {
  var callback, config;
  config = getConfig();
  callback = function(err, port) {
    test.ok(err);
    test.ok(!port);
    return test.done();
  };
  return instanceLookup(config.server, 'badInstanceName', callback, 100, 1);
};

exports.badServer = function(test) {
  var callback, config;
  config = getConfig();
  callback = function(err, port) {
    test.ok(err);
    test.ok(!port);
    return test.done();
  };
  return instanceLookup(RESERVED_IP_ADDRESS, config.instanceName, callback, 100, 1);
};
