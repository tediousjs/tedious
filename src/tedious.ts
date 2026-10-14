import BulkLoad, { type Options as BulkLoadOptions, type Callback as BulkLoadCallback, type ColumnOptions } from './bulk-load';
import Connection, {
  type ConnectionAuthentication,
  type ConnectionConfiguration,
  type ConnectionOptions,
  type AuthenticationOptions,
  type DebugOptions,
  type DefaultAuthentication,
  type NtlmAuthentication,
  type TokenCredentialAuthentication,
  type AzureActiveDirectoryPasswordAuthentication,
  type AzureActiveDirectoryMsiAppServiceAuthentication,
  type AzureActiveDirectoryMsiVmAuthentication,
  type AzureActiveDirectoryAccessTokenAuthentication,
  type AzureActiveDirectoryServicePrincipalSecret,
  type AzureActiveDirectoryDefaultAuthentication,
  type BeginTransactionCallback,
  type SaveTransactionCallback,
  type CommitTransactionCallback,
  type RollbackTransactionCallback,
  type ResetCallback
} from './connection';
import Request, { type ParameterOptions } from './request';
import { name } from './library';

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
  ConnectionAuthentication,
  ConnectionConfiguration,
  ConnectionOptions,
  AuthenticationOptions,
  DebugOptions,
  DefaultAuthentication,
  NtlmAuthentication,
  TokenCredentialAuthentication,
  AzureActiveDirectoryPasswordAuthentication,
  AzureActiveDirectoryMsiAppServiceAuthentication,
  AzureActiveDirectoryMsiVmAuthentication,
  AzureActiveDirectoryAccessTokenAuthentication,
  AzureActiveDirectoryServicePrincipalSecret,
  AzureActiveDirectoryDefaultAuthentication,
  BeginTransactionCallback,
  SaveTransactionCallback,
  CommitTransactionCallback,
  RollbackTransactionCallback,
  ResetCallback,
  ParameterOptions,
  BulkLoadOptions,
  BulkLoadCallback,
  ColumnOptions
};
