import BulkLoad from './bulk-load';
import Connection, { type ConnectionAuthentication, type ConnectionConfiguration, type ConnectionOptions } from './connection';
import Request, { type ParameterOptions, type RequestOptions } from './request';
import { AzureKeyVaultKeyStoreProvider, RsaKeyStoreProvider, type AzureKeyVaultCryptographyClient, type AzureKeyVaultKeyStoreProviderOptions, type ColumnEncryptionKeyStoreProvider, type RsaPrivateKey } from './always-encrypted/key-store-provider';
import { type ColumnEncryptionKeyInfo, type ColumnEncryptionOptions, type CryptoMetadata, type EncryptedColumnEncryptionKey, type EncryptionType } from './always-encrypted/types';
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
  TDS_VERSION,
  AzureKeyVaultKeyStoreProvider,
  RsaKeyStoreProvider
};

export type {
  ConnectionAuthentication,
  ConnectionConfiguration,
  ConnectionOptions,
  ParameterOptions,
  RequestOptions,
  AzureKeyVaultCryptographyClient,
  AzureKeyVaultKeyStoreProviderOptions,
  ColumnEncryptionKeyInfo,
  ColumnEncryptionKeyStoreProvider,
  ColumnEncryptionOptions,
  CryptoMetadata,
  EncryptedColumnEncryptionKey,
  EncryptionType,
  RsaPrivateKey
};
