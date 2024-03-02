export class ConnectionError extends Error {
  declare code: string | undefined;

  declare isTransient: boolean | undefined;

  constructor(message: string, code?: string) {
    super(message);

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
