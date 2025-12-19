import { TransientErrorLookup } from '../../src/transient-error-lookup';
import { assert } from 'chai';

// This test is simply a set of assertions to ensure any additions to or deletions
// from the list of transient errors is intentional.

describe('Connection configuration validation', () => {
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
