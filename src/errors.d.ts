export interface ConnectionError extends Error {
  message: string;
  code?: string;
}

export declare var ConnectionError: {
  (message: ConnectionError): ConnectionError;
  (message: string, code?: string): ConnectionError
  new (message: string, code?: string): ConnectionError;
}

export interface RequestError extends Error {
  message: string;
  code?: string;
}

export declare var RequestError: {
  (message: RequestError): RequestError;
  (message: string, code?: string): RequestError
  new (message: string, code?: string): RequestError;
}
