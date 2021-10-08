const util = require('util');

module.exports.ConnectionError = ConnectionError;
function ConnectionError(message, code) {
  if (!(this instanceof ConnectionError)) {
    emitConnectionErrorWithoutNewWarning();

    if (message instanceof ConnectionError) {
      return message;
    }

    return new ConnectionError(message, code);
  }

  Error.call(this);

  this.message = message;
  this.code = code;

  Error.captureStackTrace(this, this.constructor);
}

util.inherits(ConnectionError, Error);

ConnectionError.prototype.name = 'ConnectionError';

module.exports.RequestError = RequestError;
function RequestError(message, code) {
  if (!(this instanceof RequestError)) {
    emitRequestErrorWithoutNewWarning();

    if (message instanceof RequestError) {
      return message;
    }

    return new RequestError(message, code);
  }

  Error.call(this);

  this.message = message;
  this.code = code;

  Error.captureStackTrace(this, this.constructor);
}

util.inherits(RequestError, Error);

RequestError.prototype.name = 'RequestError';

let connectionErrorWithoutNewWarningEmitted = false;
function emitConnectionErrorWithoutNewWarning() {
  if (connectionErrorWithoutNewWarningEmitted) {
    return;
  }

  connectionErrorWithoutNewWarningEmitted = true;

  process.emitWarning(
    'Calling the `ConnectionError` constructor function without new is deprecated ' +
    'and will throw an error in a future release of `tedious`.',
    'DeprecationWarning',
    ConnectionError
  );
}

let requestErrorWithoutNewWarningEmitted = false;
function emitRequestErrorWithoutNewWarning() {
  if (requestErrorWithoutNewWarningEmitted) {
    return;
  }

  requestErrorWithoutNewWarningEmitted = true;

  process.emitWarning(
    'Calling the `RequestError` constructor function without new is deprecated ' +
    'and will throw an error in a future release of `tedious`.',
    'DeprecationWarning',
    RequestError
  );
}
