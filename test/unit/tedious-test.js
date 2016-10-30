'use strict';

const Connection = require('../../src/tedious').Connection;
const ISOLATION_LEVEL = require('../../src/tedious').ISOLATION_LEVEL;
const TYPES = require('../../src/tedious').TYPES;

exports.types = function(test) {
  test.ok(TYPES);
  test.ok(TYPES.VarChar);

  test.done();
};

exports.isolationLevel = function(test) {
  test.ok(ISOLATION_LEVEL);
  test.ok(ISOLATION_LEVEL.READ_UNCOMMITTED);

  test.done();
};

exports.connection = function(test) {
  test.ok(Connection);

  test.done();
};

exports.connectionDeepCopiesConfig = function(test) {
  var userName = 'sa';
  var password = 'sapwd';
  var port = 1234;
  var ciphers = 'RC4-MD5';

  var config = {};
  config.userName = userName;
  config.password = password;
  config.options = {};
  config.options.port = port;
  config.options.cryptoCredentialsDetails = {};
  config.options.cryptoCredentialsDetails.ciphers = ciphers;

  var configStr = JSON.stringify(config);
  var connection = new Connection(config);

  // Verify that Connection constructor did not change config object.
  test.ok(configStr === JSON.stringify(config));

  // Verify that Connection constructor copied fields correctly.
  test.ok(connection.config.userName === userName);
  test.ok(connection.config.password === password);
  test.ok(connection.config.options.port === port);
  test.ok(connection.config.options.cryptoCredentialsDetails.ciphers === ciphers);

  // Verify that Connection constructor did a deep copy of the config object.
  config.userName = '';
  config.password = '';
  config.options.port = 0;

  test.strictEqual(connection.config.userName, userName);
  test.strictEqual(connection.config.password, password);
  test.strictEqual(connection.config.options.port, port);

  // Test that we did not do a deep copy of the cryptoCredentialsDetails,
  // as we never modify that value inside tedious.
  test.strictEqual(connection.config.options.cryptoCredentialsDetails, config.options.cryptoCredentialsDetails);

  test.done();
};
