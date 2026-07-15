import { TransientErrorLookup } from '../../src/transient-error-lookup';
import { assert } from 'chai';

// This test is simply a set of assertions to ensure any additions to or deletions
// from the list of transient errors is intentional.

describe('TransientErrorLookup', () => {
  it('should identify known transient SQL errors', function() {
    const transientErrorLookup = new TransientErrorLookup();
    assert.isTrue(transientErrorLookup.isTransientError(4060));
    assert.isTrue(transientErrorLookup.isTransientError(10928));
    assert.isTrue(transientErrorLookup.isTransientError(10929));
    assert.isTrue(transientErrorLookup.isTransientError(40197));
    assert.isTrue(transientErrorLookup.isTransientError(40501));
    assert.isTrue(transientErrorLookup.isTransientError(40613));
  });

  it('should identify non-transient SQL errors', function() {
    const transientErrorLookup = new TransientErrorLookup();
    assert.strictEqual(transientErrorLookup.isTransientError(18456), false);
  });
});
