import BulkLoad from './bulk-load';
import Connection, { type ConnectionAuthentication, type ConnectionConfiguration, type ConnectionOptions } from './connection';
import Request from './request';
import { name } from './library';
import {
  type AccessTokenCredentials,
  type AccessTokenRequest,
  type AcquiredAccessTokenCredentials,
  type AuthenticationContext,
  type AuthenticationProvider,
  type Credentials,
  type PasswordCredentials,
  type SspiCredentials,
  type SspiExchange,
  type StaticAccessTokenCredentials
} from './authentication/provider';
import { type AuthenticationPlugin } from './authentication/plugin';

import { ConnectionError, InputError, RequestError } from './errors';

import { TYPES } from './data-type';
import { ISOLATION_LEVEL } from './transaction';
import { versions as TDS_VERSION } from './tds-versions';

const library = { name: name };

export function connect(config: ConnectionConfiguration, connectListener?: (err?: Error) => void) {
  const connection = new Connection(config);
  connection.connect(connectListener);
  return connection;
}

export {
  BulkLoad,
  Connection,
  Request,
  library,
  ConnectionError,
  InputError,
  RequestError,
  TYPES,
  ISOLATION_LEVEL,
  TDS_VERSION
};

export type {
  AccessTokenCredentials,
  AccessTokenRequest,
  AcquiredAccessTokenCredentials,
  AuthenticationContext,
  AuthenticationPlugin,
  AuthenticationProvider,
  ConnectionAuthentication,
  ConnectionConfiguration,
  ConnectionOptions,
  Credentials,
  PasswordCredentials,
  SspiCredentials,
  SspiExchange,
  StaticAccessTokenCredentials
};
