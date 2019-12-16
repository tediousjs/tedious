const Connection = require('../../src/tedious').Connection;
const fs = require('fs');
const sinon = require('sinon');
const TransientErrorLookup = require('../../src/transient-error-lookup').TransientErrorLookup;
const assert = require('chai').assert;

function getConfig() {
  const config = JSON.parse(fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')).config;
  if (config.authentication) {
    config.authentication.options.password = 'InvalidPassword';
  } else {
    config.password = 'InvalidPassword';
  }
  config.options.maxRetriesOnTransientErrors = 5;
  config.options.connectionRetryInterval = 25;

  return config;
}

describe('Connection Retry Test', function() {
  let invalidLoginError;

  beforeEach(function(done) {
    invalidLoginError = 18456;
    done();
  });

  afterEach(function(done) {
    sinon.restore();
    done();
  });

  it('should retry specified number of times on transient errors', function(done) {
    const config = getConfig();

    if (config.authentication && config.authentication.type === 'azure-active-directory-password') {
      return done();
    }

    sinon.stub(TransientErrorLookup.prototype, 'isTransientError').callsFake((error) => {
      return error === invalidLoginError;
    });

    const connection = new Connection(config);

    connection.on('retry', () => {
      assert.ok(true);
    });

    connection.on('connect', (err) => {
      assert.ok(err);
    });

    connection.on('end', (info) => {
      done();
    });
  });

  it('should no retries on non-transient errors', function(done) {
    const config = getConfig();

    if (config.authentication && config.authentication.type === 'azure-active-directory-password') {
      return done();
    }

    sinon.stub(TransientErrorLookup.prototype, 'isTransientError').callsFake((error) => {
      return error !== invalidLoginError;
    });

    const connection = new Connection(config);

    connection.on('retry', () => {
      assert.ok(false);
    });

    connection.on('connect', (err) => {
      assert.ok(err);
    });

    connection.on('end', (info) => {
      done();
    });
  });

  it('should no retries if connection timeout fires', function(done) {
    const config = getConfig();

    if (config.authentication && config.authentication.type === 'azure-active-directory-password') {
      return done();
    }

    config.options.connectTimeout = config.options.connectionRetryInterval / 2;

    const clock = sinon.useFakeTimers({ toFake: ['setTimeout'] });

    sinon.stub(TransientErrorLookup.prototype, 'isTransientError').callsFake((error) => {
      return error === invalidLoginError;
    });

    const connection = new Connection(config);

    connection.on('retry', () => {
      assert.ok(false);
    });

    connection.on('errorMessage', () => {
      // Forward clock past connectTimeout which is less than retry interval.
      clock.tick(config.options.connectTimeout + 1);
    });

    connection.on('connect', (err) => {
      assert.ok(err);
    });

    connection.on('end', (info) => {
      clock.restore();
      done();
    });
  });
});
