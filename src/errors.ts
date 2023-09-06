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

export class ParameterValidationError extends TypeError {
  paramName: string | undefined;
  paramValue: any | undefined;

  constructor(message: string, paramName: string, paramValue: any) {
    super(message);
    this.paramName = paramName;
    this.paramValue = paramValue;
  }
}
