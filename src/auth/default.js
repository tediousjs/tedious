const EMPTY_BUFFER = new Buffer(0);

/**
  Authenticate to SQL Server via built-in authentication.
*/
class DefaultAuthProvider {
  constructor(connection, options) {
    this.connection = connection;
    this.options = options;
  }

  handshake(data, callback) {
    process.nextTick(callback, null, EMPTY_BUFFER);
  }
}

module.exports = function(options) {
  return function(connection) {
    return new DefaultAuthProvider(connection, options);
  };
};

module.exports.DefaultAuthProvider = DefaultAuthProvider;
