const Connection = require('../../src/tedious').Connection;
const fs = require('fs');
const sinon = require('sinon');
const TransientErrorLookup = require('../../src/transient-error-lookup').TransientErrorLookup;

const getConfig = function() {
  const config = JSON.parse(fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')).config;
  if (config.authentication) {
    config.authentication.options.password = 'InvalidPassword';
  } else {
    config.password = 'InvalidPassword';
  }
  config.options.maxRetriesOnTransientErrors = 5;
  config.options.connectionRetryInterval = 25;

  return config;
};

const INVALID_LOGIN_ERROR = 18456;

exports['connection retry tests'] = {
  tearDown: function(done) {
    sinon.restore();
    done();
  },

  'retry specified number of times on transient errors': function(test) {
    const config = getConfig();

    if (config.authentication && config.authentication.type === 'azure-active-directory-password') {
      return test.done();
    }

    config.options.connectTimeout = 5000;

    test.expect(config.options.maxRetriesOnTransientErrors + 1);

    sinon.stub(TransientErrorLookup.prototype, 'isTransientError').callsFake((errorNumber) => {
      return errorNumber === INVALID_LOGIN_ERROR;
    });

    const connection = new Connection(config);

    connection.on('retry', () => {
      test.ok(true);
    });

    connection.on('connect', (err) => {
      test.ok(err);
    });

    connection.on('end', (info) => {
      test.done();
    });
  },

  'stops retries once connection is gracefully closed during `retry` event': function(test) {
    const config = getConfig();

    if (config.authentication && config.authentication.type === 'azure-active-directory-password') {
      return test.done();
    }

    test.expect(1);

    sinon.stub(TransientErrorLookup.prototype, 'isTransientError').callsFake((errorNumber) => {
      return errorNumber === INVALID_LOGIN_ERROR;
    });

    const connection = new Connection(config);

    let retryCount = 0;
    connection.on('retry', () => {
      retryCount += 1;

      if (retryCount == 3) {
        connection.close();
      }
    });

    connection.on('connect', (err) => {
      test.ok(false);
    });

    connection.on('end', () => {
      test.strictEqual(retryCount, 3);

      test.done();
    });
  },

  'stops retries once connection is forcefully destroyed  during `retry` event': function(test) {
    const config = getConfig();

    if (config.authentication && config.authentication.type === 'azure-active-directory-password') {
      return test.done();
    }

    test.expect(1);

    sinon.stub(TransientErrorLookup.prototype, 'isTransientError').callsFake((errorNumber) => {
      return errorNumber === INVALID_LOGIN_ERROR;
    });

    const connection = new Connection(config);

    let retryCount = 0;
    connection.on('retry', () => {
      retryCount += 1;

      if (retryCount == 3) {
        connection.destroy();
      }
    });

    connection.on('connect', (err) => {
      test.ok(false);
    });

    connection.on('end', () => {
      test.strictEqual(retryCount, 3);

      test.done();
    });
  },

  'does handle connection destruction during connection retry interval': function(test) {
    const config = getConfig();

    if (config.authentication && config.authentication.type === 'azure-active-directory-password') {
      return test.done();
    }

    config.options.connectionRetryInterval = 250;

    test.expect(0);

    sinon.stub(TransientErrorLookup.prototype, 'isTransientError').callsFake((errorNumber) => {
      return errorNumber === INVALID_LOGIN_ERROR;
    });

    const connection = new Connection(config);

    setTimeout(() => {
      connection.destroy();
    }, 100);

    connection.on('retry', () => {
      test.ok(false);
    });

    connection.on('connect', (err) => {
      test.ok(false);
    });

    connection.on('end', () => {
      test.done();
    });
  },

  'does handle connection close during connection retry interval': function(test) {
    const config = getConfig();

    if (config.authentication && config.authentication.type === 'azure-active-directory-password') {
      return test.done();
    }

    config.options.connectionRetryInterval = 250;

    test.expect(0);

    sinon.stub(TransientErrorLookup.prototype, 'isTransientError').callsFake((errorNumber) => {
      return errorNumber === INVALID_LOGIN_ERROR;
    });

    const connection = new Connection(config);

    setTimeout(() => {
      connection.close();
    }, 100);

    connection.on('retry', () => {
      test.ok(false);
    });

    connection.on('connect', (err) => {
      test.ok(false);
    });

    connection.on('end', () => {
      test.done();
    });
  },

  'no retries on non-transient errors': function(test) {
    const config = getConfig();

    if (config.authentication && config.authentication.type === 'azure-active-directory-password') {
      return test.done();
    }

    test.expect(1);

    sinon.stub(TransientErrorLookup.prototype, 'isTransientError').callsFake((error) => {
      return error !== INVALID_LOGIN_ERROR;
    });

    const connection = new Connection(config);

    connection.on('retry', () => {
      test.ok(false);
    });

    connection.on('connect', (err) => {
      test.ok(err);
    });

    connection.on('end', (info) => {
      test.done();
    });
  },

  'no retries if connection timeout fires': function(test) {
    const config = getConfig();

    if (config.authentication && config.authentication.type === 'azure-active-directory-password') {
      return test.done();
    }

    config.options.connectTimeout = config.options.connectionRetryInterval / 2;

    const clock = sinon.useFakeTimers({ toFake: [ 'setTimeout' ] });

    test.expect(1);

    sinon.stub(TransientErrorLookup.prototype, 'isTransientError').callsFake((errorNumber) => {
      return errorNumber === INVALID_LOGIN_ERROR;
    });

    const connection = new Connection(config);

    connection.on('retry', () => {
      test.ok(false);
    });

    connection.on('errorMessage', () => {
      // Forward clock past connectTimeout which is less than retry interval.
      clock.tick(config.options.connectTimeout + 1);
    });

    connection.on('connect', (err) => {
      test.ok(err);
    });

    connection.on('end', (info) => {
      clock.restore();
      test.done();
    });
  },
};
