export class ConnectionError extends Error {
  code: string | undefined;

  isTransient: boolean | undefined;

  constructor(message: string, code?: string) {
    super(message);

    this.code = code;
  }
}

export class RequestError extends Error {
  code: string | undefined;

  number: number | undefined;
  state: number | undefined;
  class: number | undefined;
  serverName: string | undefined;
  procName: string | undefined;
  lineNumber: number | undefined;

  constructor(message: string, code?: string) {
    super(message);

    this.code = code;
  }
}

export class AbortError extends Error {
  code: string;

  constructor() {
    super('The operation was aborted');

    this.code = 'ABORT_ERR';
    this.name = 'AbortError';
  }
}
