import util from 'util';

export function ConnectionError(message, code) {
  if (!(this instanceof ConnectionError)) {
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

ConnectionError.prototype.name = "ConnectionError";

export function RequestError(message, code) {
  if (!(this instanceof RequestError)) {
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

RequestError.prototype.name = "RequestError";
