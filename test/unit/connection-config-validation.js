const Connection = require('../../src/tedious').Connection;
const assert = require('chai').assert;

function ensureConnectionIsClosed(connection, callback) {
  if (connection.closed) {
    process.nextTick(callback);
    return;
  }

  connection.on('end', callback);
  connection.close();
}

describe('Connection configuration validation', function() {
  let config;

  beforeEach(function() {
    config = {};
    config.options = { encrypt: false };
    config.server = 'localhost';
  });

  it('default transient retry interval', () => {
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.connectionRetryInterval, 500);
    ensureConnectionIsClosed(connection, () => {});
  });

  it('good transient retry interval', () => {
    const goodRetryInterval = 75;
    config.options.connectionRetryInterval = goodRetryInterval;
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.connectionRetryInterval, goodRetryInterval);
    ensureConnectionIsClosed(connection, () => {});
  });

  it('bad transient retry interval', () => {
    const zeroRetryInterval = 0;
    config.options.connectionRetryInterval = zeroRetryInterval;
    assert.throws(() => {
      new Connection(config);
    });

    const negativeRetryInterval = -25;
    config.options.connectionRetryInterval = negativeRetryInterval;
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('default max transient retries', () => {
    const connection = new Connection(config);
    assert.strictEqual(connection.config.options.maxRetriesOnTransientErrors, 3);
    ensureConnectionIsClosed(connection, () => {});
  });

  it('good max transient retries', () => {
    const zeroMaxRetries = 0;
    config.options.maxRetriesOnTransientErrors = zeroMaxRetries;
    const firstConnection = new Connection(config);
    assert.strictEqual(firstConnection.config.options.maxRetriesOnTransientErrors, zeroMaxRetries);

    const nonZeroMaxRetries = 5;
    config.options.maxRetriesOnTransientErrors = nonZeroMaxRetries;
    const secondConnection = new Connection(config);
    assert.strictEqual(secondConnection.config.options.maxRetriesOnTransientErrors, nonZeroMaxRetries);

    ensureConnectionIsClosed(firstConnection, () => {
      ensureConnectionIsClosed(secondConnection, () => {});
    });
  });

  it('bad max transient retries', () => {
    const negativeMaxRetries = -5;
    config.options.maxRetriesOnTransientErrors = negativeMaxRetries;
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('bad azure ad authentication method', () => {
    const authenticationMethod = 'abc';
    config.authentication = authenticationMethod;
    assert.throws(() => {
      new Connection(config);
    });
  });

  it('bad tds version for with azure ad', () => {
    const authenticationMethod = 'activedirectorypassword';
    config.authentication = authenticationMethod;
    config.options.tdsVersion = '7_2';
    assert.throws(() => {
      new Connection(config);
    });
  });
});
