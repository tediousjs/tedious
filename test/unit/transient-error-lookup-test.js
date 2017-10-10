const TransientErrorLookup = require('../../src/transient-error-lookup').TransientErrorLookup;

// This test is simply a set of assertions to ensure any additions to or deletions
// from the list of transient errors is intentional.
exports['Connection configuration validation'] = {
  'transient errors': function(test) {
    const transientErrorLookup = new TransientErrorLookup(this.config);
    test.ok(transientErrorLookup.isTransientError(4060));
    test.ok(transientErrorLookup.isTransientError(10928));
    test.ok(transientErrorLookup.isTransientError(10929));
    test.ok(transientErrorLookup.isTransientError(40197));
    test.ok(transientErrorLookup.isTransientError(40501));
    test.ok(transientErrorLookup.isTransientError(40613));
    test.done();
  },

  'not transient error': function(test) {
    const transientErrorLookup = new TransientErrorLookup(this.config);
    test.strictEqual(transientErrorLookup.isTransientError(18456), false);
    test.done();
  }
};
