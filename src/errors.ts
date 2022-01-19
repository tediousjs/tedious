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
