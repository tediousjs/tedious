export declare class RequestError extends Error {
  code?: string;

  constructor(message: string, code?: string)
}

export declare class ConnectionError extends Error {
  code?: string;
  isTransient?: boolean;

  constructor(message: string, code?: string)
}
