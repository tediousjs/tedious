const TransientErrorLookup = require('../../src/transient-error-lookup').TransientErrorLookup;
const assert = require('chai').assert;

// This test is simply a set of assertions to ensure any additions to or deletions
// from the list of transient errors is intentional.

describe('Connection configuration validation', (done) => {
  let config;

  beforeEach(function(done) {
    config = {};
    done();
  });

  it('transient errors', (done) => {
    const transientErrorLookup = new TransientErrorLookup(config);
    assert.ok(transientErrorLookup.isTransientError(4060));
    assert.ok(transientErrorLookup.isTransientError(10928));
    assert.ok(transientErrorLookup.isTransientError(10929));
    assert.ok(transientErrorLookup.isTransientError(40197));
    assert.ok(transientErrorLookup.isTransientError(40501));
    assert.ok(transientErrorLookup.isTransientError(40613));
    done();
  });

  it('not transient error', (done) => {
    const transientErrorLookup = new TransientErrorLookup(config);
    assert.strictEqual(transientErrorLookup.isTransientError(18456), false);
    done();
  });
});
