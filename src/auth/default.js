const EMPTY_BUFFER = new Buffer(0);

class DefaultAuthProvider {
  constructor(connection, options) {
    this.connection = connection;
    this.options = options;
  }

  handshake(data, callback) {
    callback(null, EMPTY_BUFFER);
  }
}

module.exports = function(options) {
  return function(connection) {
    return new DefaultAuthProvider(connection, options);
  };
};

module.exports.DefaultAuthProvider = DefaultAuthProvider;
