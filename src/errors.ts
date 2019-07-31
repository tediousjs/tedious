export class ConnectionError extends Error {
  name = 'ConnectionError';

  isTransient?: boolean;
  code?: string;

  constructor(message: string, code?: string) {
    super(message);

    this.message = message;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class RequestError extends Error {
  name = 'RequestError';

  code?: string;

  number?: number;
  state?: string;
  class?: string;
  serverName?: string;
  procName?: string;
  lineNumber?: number;

  constructor(message: string, code?: string) {
    super(message);

    this.message = message;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}
