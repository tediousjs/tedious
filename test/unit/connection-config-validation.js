const Connection = require('../../src/tedious').Connection;

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
    test.done();
  },

  'good transient retry interval': function(test) {
    const goodRetryInterval = 75;
    this.config.options.connectionRetryInterval = goodRetryInterval;
    const connection = new Connection(this.config);
    test.strictEqual(connection.config.options.connectionRetryInterval, goodRetryInterval);
    test.done();
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
    test.done();
  },

  'good max transient retries': function(test) {
    const zeroMaxRetries = 0;
    this.config.options.maxRetriesOnTransientErrors = zeroMaxRetries;
    let connection = new Connection(this.config);
    test.strictEqual(connection.config.options.maxRetriesOnTransientErrors, zeroMaxRetries);

    const nonZeroMaxRetries = 5;
    this.config.options.maxRetriesOnTransientErrors = nonZeroMaxRetries;
    connection = new Connection(this.config);
    test.strictEqual(connection.config.options.maxRetriesOnTransientErrors, nonZeroMaxRetries);

    test.done();
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
