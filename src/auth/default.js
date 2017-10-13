const EMPTY_BUFFER = new Buffer(0);

class DefaultAuthProvider {
  constructor(connection) {}

  handshake(data, callback) {
    callback(null, EMPTY_BUFFER);
  }
}

module.exports = DefaultAuthProvider;
