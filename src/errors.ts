export class ConnectionError extends Error {
  declare code: string | undefined;

  declare isTransient: boolean | undefined;

  /**
   * For errors reported by the server during login (`ELOGIN`), the server's
   * error number, state, severity class and server name. `undefined` for
   * errors that did not originate from the server.
   */
  declare number: number | undefined;
  declare state: number | undefined;
  declare class: number | undefined;
  declare serverName: string | undefined;

  constructor(message: string, code?: string, options?: ErrorOptions) {
    super(message, options);

    this.code = code;
  }
}

export class RequestError extends Error {
  declare code: string | undefined;

  declare number: number | undefined;
  declare state: number | undefined;
  declare class: number | undefined;
  declare serverName: string | undefined;
  declare procName: string | undefined;
  declare lineNumber: number | undefined;

  constructor(message: string, code?: string, options?: ErrorOptions) {
    super(message, options);

    this.code = code;
  }
}

export class InputError extends TypeError {}
