const Connection = require('../../src/tedious').Connection;

function ensureConnectionIsClosed(connection, callback) {
  if (connection.closed) {
    process.nextTick(callback);
    return;
  }

  connection.on('end', callback);
  connection.close();
}

exports['Connection configuration validation'] = {
  setUp: function(done) {
    this.config = {};
    this.config.options = { encrypt: false };
    this.config.server = 'localhost';
    done();
  },

  'default transient retry interval': function(test) {
    const connection = new Connection(this.config);
    test.strictEqual(connection.config.options.connectionRetryInterval, 500);
    ensureConnectionIsClosed(connection, () => { test.done(); });
  },

  'good transient retry interval': function(test) {
    const goodRetryInterval = 75;
    this.config.options.connectionRetryInterval = goodRetryInterval;
    const connection = new Connection(this.config);
    test.strictEqual(connection.config.options.connectionRetryInterval, goodRetryInterval);
    ensureConnectionIsClosed(connection, () => { test.done(); });
  },

  'bad transient retry interval': function(test) {
    const zeroRetryInterval = 0;
    this.config.options.connectionRetryInterval = zeroRetryInterval;
    test.throws(() => {
      new Connection(this.config);
    });

    const negativeRetryInterval = -25;
    this.config.options.connectionRetryInterval = negativeRetryInterval;
    test.throws(() => {
      new Connection(this.config);
    });

    test.done();
  },

  'default max transient retries': function(test) {
    const connection = new Connection(this.config);
    test.strictEqual(connection.config.options.maxRetriesOnTransientErrors, 3);
    ensureConnectionIsClosed(connection, () => { test.done(); });
  },

  'good max transient retries': function(test) {
    const zeroMaxRetries = 0;
    this.config.options.maxRetriesOnTransientErrors = zeroMaxRetries;
    const firstConnection = new Connection(this.config);
    test.strictEqual(firstConnection.config.options.maxRetriesOnTransientErrors, zeroMaxRetries);

    const nonZeroMaxRetries = 5;
    this.config.options.maxRetriesOnTransientErrors = nonZeroMaxRetries;
    const secondConnection = new Connection(this.config);
    test.strictEqual(secondConnection.config.options.maxRetriesOnTransientErrors, nonZeroMaxRetries);

    ensureConnectionIsClosed(firstConnection, () => {
      ensureConnectionIsClosed(secondConnection, () => {
        test.done();
      });
    });
  },

  'bad max transient retries': function(test) {
    const negativeMaxRetries = -5;
    this.config.options.maxRetriesOnTransientErrors = negativeMaxRetries;
    test.throws(() => {
      new Connection(this.config);
    });

    test.done();
  }
};
