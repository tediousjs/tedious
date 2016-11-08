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

exports.connectionDoesNotModifyPassedConfig = function(test) {
  var config = {
    userName: 'sa',
    password: 'sapwd',
    options: {
      port: 1234,
      cryptoCredentialsDetails: {
        ciphers: 'RC4-MD5'
      }
    }
  };

  var connection = new Connection(config);

  test.notStrictEqual(connection.config, config);
  test.notStrictEqual(connection.config.options, config.options);

  // Test that we did not do a deep copy of the cryptoCredentialsDetails,
  // as we never modify that value inside tedious.
  test.strictEqual(connection.config.options.cryptoCredentialsDetails, config.options.cryptoCredentialsDetails);

  test.done();
};
