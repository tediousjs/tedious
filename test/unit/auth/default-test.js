const DefaultAuthProvider = require('../../../src/auth/default').DefaultAuthProvider;

module.exports = {
  'DefaultAuthProvider.handshake': {
    'calls the given callback with an empty buffer': function(test) {
      const authProvider = new DefaultAuthProvider();
      authProvider.handshake(null, function(error, data) {
        test.ifError();

        test.ok(Buffer.isBuffer(data));
        test.strictEqual(data.length, 0);

        test.done();
      });
    }
  }
};
