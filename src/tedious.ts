import BulkLoad from './bulk-load';
import Connection, { type ConnectionAuthentication, type ConnectionConfiguration, type ConnectionOptions } from './connection';
import Request from './request';
import { name } from './library';
import {
  type AuthenticationContext,
  type AuthenticationProvider,
  type AuthenticationSession,
  type FederatedAuthenticationInfo,
  type FederatedAuthenticationSession,
  type MsalFederatedAuthenticationSession,
  type SecurityTokenFederatedAuthenticationSession,
  type SqlAuthenticationSession,
  type SspiAuthenticationSession
} from './authentication/provider';

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
  AuthenticationContext,
  AuthenticationProvider,
  AuthenticationSession,
  ConnectionAuthentication,
  ConnectionConfiguration,
  ConnectionOptions,
  FederatedAuthenticationInfo,
  FederatedAuthenticationSession,
  MsalFederatedAuthenticationSession,
  SecurityTokenFederatedAuthenticationSession,
  SqlAuthenticationSession,
  SspiAuthenticationSession
};
