const TransientErrorLookup = require('../../src/transient-error-lookup').TransientErrorLookup;
const assert = require('chai').assert;

// This test is simply a set of assertions to ensure any additions to or deletions
// from the list of transient errors is intentional.

describe('Connection configuration validation', (done) => {
  it('transient errors', () => {
    const transientErrorLookup = new TransientErrorLookup();
    assert.ok(transientErrorLookup.isTransientError(4060));
    assert.ok(transientErrorLookup.isTransientError(10928));
    assert.ok(transientErrorLookup.isTransientError(10929));
    assert.ok(transientErrorLookup.isTransientError(40197));
    assert.ok(transientErrorLookup.isTransientError(40501));
    assert.ok(transientErrorLookup.isTransientError(40613));
  });

  it('not transient error', () => {
    const transientErrorLookup = new TransientErrorLookup();
    assert.strictEqual(transientErrorLookup.isTransientError(18456), false);
  });
});
