const EMPTY_BUFFER = new Buffer(0);

/**
  Authenticate to SQL Server via built-in authentication.

  @param {Connection} connection
  @param {Object} options
*/
class DefaultAuthProvider {
  constructor(connection, options) {
    this.connection = connection;
    this.options = options;
  }

  /*
    Perform authentication handshakes.

    This method will be called one or multiple times during the authentication
    handshake procedure. The `data` parameter can either be `null`
    (to get the initial client handshake) or a `Buffer` containing
    authentication data from the server.

    `callback` should be called asynchronously with an error or
    with the data to be sent back to the server.

    @param {?Buffer}
    @param {Function} callback
  */
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
