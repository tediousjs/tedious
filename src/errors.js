const util = require('util');

const { BaseError } = require('make-error-cause');

class ConnectionError extends BaseError {
  constructor(message, code, cause) {
    super(message, cause);

    this.code = code;
  }
}

class RequestError extends BaseError {
  constructor(message, code, cause) {
    super(message, cause);

    this.code = code;
  }
}

module.exports.ConnectionError = ConnectionError;
module.exports.RequestError = RequestError;
