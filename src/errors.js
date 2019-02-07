// @flow

module.exports.ConnectionError = class ConnectionError extends Error {
  code: string | void;
  name: string;
  isTransient: boolean | void;

  constructor(message: string, code: string | void) {
    super(message);

    this.code = code;
    this.name = 'ConnectionError';

    Error.captureStackTrace(this, this.constructor);
  }
};

module.exports.RequestError = class RequestError extends Error {
  code: string | void;
  name: string;

  procName: string | void;
  serverName: string | void;
  class: string | void;
  state: string | void;

  constructor(message: string, code: string | void) {
    super(message);

    this.code = code;
    this.name = 'RequestError';

    Error.captureStackTrace(this, this.constructor);
  }
};

//
// module.exports.RequestError = function(message, code) {
//   if (!(this instanceof RequestError)) {
//     if (message instanceof RequestError) {
//       return message;
//     }
//
//     return new RequestError(message, code);
//   }
//
//   Error.call(this);
//
//   this.message = message;
//   this.code = code;
//
//   Error.captureStackTrace(this, this.constructor);
// }
//
// util.inherits(RequestError, Error);
//
// RequestError.prototype.name = 'RequestError';
