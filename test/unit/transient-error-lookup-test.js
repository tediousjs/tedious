const TransientErrorLookup = require('../../src/transient-error-lookup').TransientErrorLookup;

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
