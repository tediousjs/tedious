import crypto from 'crypto';
import os from 'os';
import { Socket } from 'net';

import constants from 'constants';
import { createSecureContext, SecureContext, SecureContextOptions } from 'tls';

import { Readable } from 'readable-stream';

import {
  loginWithUsernamePassword,
  loginWithVmMSI,
  loginWithAppServiceMSI,
  loginWithServicePrincipalSecret,
  UserTokenCredentials,
  MSIVmTokenCredentials,
  MSIAppServiceTokenCredentials,
  ApplicationTokenCredentials
} from '@azure/ms-rest-nodeauth';

import BulkLoad, { Options as BulkLoadOptions, Callback as BulkLoadCallback } from './bulk-load';
import Debug from './debug';
import { EventEmitter } from 'events';
import { InstanceLookup } from './instance-lookup';
import { TransientErrorLookup } from './transient-error-lookup';
import { TYPE } from './packet';
import PreloginPayload from './prelogin-payload';
import Login7Payload from './login7-payload';
import NTLMResponsePayload from './ntlm-payload';
import Request from './request';
import RpcRequestPayload from './rpcrequest-payload';
import SqlBatchPayload from './sqlbatch-payload';
import MessageIO from './message-io';
import { Parser as TokenStreamParser } from './token/token-stream-parser';
import { Transaction, ISOLATION_LEVEL, assertValidIsolationLevel } from './transaction';
import { ConnectionError, RequestError } from './errors';
import { Connector } from './connector';
import { name as libraryName } from './library';
import { versions } from './tds-versions';
import Message from './message';
import { Metadata } from './metadata-parser';
import { FedAuthInfoToken, FeatureExtAckToken } from './token/token';
import { createNTLMRequest } from './ntlm';
import { ColumnMetadata } from './token/colmetadata-token-parser';
import { shouldHonorAE } from './always-encrypted/utils';
import { ColumnEncryptionAzureKeyVaultProvider } from './always-encrypted/keystore-provider-azure-key-vault';
import { getParameterEncryptionMetadata } from './always-encrypted/get-parameter-encryption-metadata';

import depd from 'depd';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const deprecate = depd('tedious');

type BeginTransactionCallback =
  /**
   * The callback is called when the request to start the transaction has completed,
   * either successfully or with an error.
   * If an error occurred then `err` will describe the error.
   *
   * As only one request at a time may be executed on a connection, another request should not
   * be initiated until this callback is called.
   *
   * @param err If an error occurred, an [[Error]] object with details of the error.
   * @param transactionDescriptor A Buffer that describe the transaction
   */
  (err: Error | null | undefined, transactionDescriptor?: Buffer) => void

type SaveTransactionCallback =
  /**
   * The callback is called when the request to set a savepoint within the
   * transaction has completed, either successfully or with an error.
   * If an error occurred then `err` will describe the error.
   *
   * As only one request at a time may be executed on a connection, another request should not
   * be initiated until this callback is called.
   *
   * @param err If an error occurred, an [[Error]] object with details of the error.
   */
  (err: Error | null | undefined) => void;

type CommitTransactionCallback =
  /**
   * The callback is called when the request to commit the transaction has completed,
   * either successfully or with an error.
   * If an error occurred then `err` will describe the error.
   *
   * As only one request at a time may be executed on a connection, another request should not
   * be initiated until this callback is called.
   *
   * @param err If an error occurred, an [[Error]] object with details of the error.
   */
  (err: Error | null | undefined) => void;

type RollbackTransactionCallback =
  /**
   * The callback is called when the request to rollback the transaction has
   * completed, either successfully or with an error.
   * If an error occurred then err will describe the error.
   *
   * As only one request at a time may be executed on a connection, another request should not
   * be initiated until this callback is called.
   *
   * @param err If an error occurred, an [[Error]] object with details of the error.
   */
  (err: Error | null | undefined) => void;

type ResetCallback =
  /**
   * The callback is called when the connection reset has completed,
   * either successfully or with an error.
   *
   * If an error occurred then `err` will describe the error.
   *
   * As only one request at a time may be executed on a connection, another
   * request should not be initiated until this callback is called
   *
   * @param err If an error occurred, an [[Error]] object with details of the error.
   */
  (err: Error | null | undefined) => void;

type TransactionCallback<T extends (err: Error | null | undefined, ...args: any[]) => void> =
  /**
   * The callback is called when the request to start a transaction (or create a savepoint, in
   * the case of a nested transaction) has completed, either successfully or with an error.
   * If an error occurred, then `err` will describe the error.
   * If no error occurred, the callback should perform its work and eventually call
   * `done` with an error or null (to trigger a transaction rollback or a
   * transaction commit) and an additional completion callback that will be called when the request
   * to rollback or commit the current transaction has completed, either successfully or with an error.
   * Additional arguments given to `done` will be passed through to this callback.
   *
   * As only one request at a time may be executed on a connection, another request should not
   * be initiated until the completion callback is called.
   *
   * @param err If an error occurred, an [[Error]] object with details of the error.
   * @param txDone If no error occurred, a function to be called to commit or rollback the transaction.
   */
  (err: Error | null | undefined, txDone?: TransactionDone<T>) => void;

type TransactionDoneCallback = (err: Error | null | undefined, ...args: any[]) => void;
type CallbackParameters<T extends (err: Error | null | undefined, ...args: any[]) => any> = T extends (err: Error | null | undefined, ...args: infer P) => any ? P : never;

type TransactionDone<T extends (err: Error | null | undefined, ...args: any[]) => void> =
  /**
   * If no error occurred, a function to be called to commit or rollback the transaction.
   *
   * @param err If an err occurred, a string with details of the error.
   */
  (err: Error | null | undefined, done: T, ...args: CallbackParameters<T>) => void;

/**
 * @private
 */
const KEEP_ALIVE_INITIAL_DELAY = 30 * 1000;
/**
 * @private
 */
const DEFAULT_CONNECT_TIMEOUT = 15 * 1000;
/**
 * @private
 */
const DEFAULT_CLIENT_REQUEST_TIMEOUT = 15 * 1000;
/**
 * @private
 */
const DEFAULT_CANCEL_TIMEOUT = 5 * 1000;
/**
 * @private
 */
const DEFAULT_CONNECT_RETRY_INTERVAL = 500;
/**
 * @private
 */
const DEFAULT_PACKET_SIZE = 4 * 1024;
/**
 * @private
 */
const DEFAULT_TEXTSIZE = '2147483647';
/**
 * @private
 */
const DEFAULT_DATEFIRST = 7;
/**
 * @private
 */
const DEFAULT_PORT = 1433;
/**
 * @private
 */
const DEFAULT_TDS_VERSION = '7_4';
/**
 * @private
 */
const DEFAULT_LANGUAGE = 'us_english';
/**
 * @private
 */
const DEFAULT_DATEFORMAT = 'mdy';

interface AzureActiveDirectoryMsiAppServiceAuthentication {
  type: 'azure-active-directory-msi-app-service';
  options: {
    /**
     * If you user want to connect to an Azure app service using a specific client account
     * they need to provide `clientId` asscoiate to their created idnetity.
     *
     * This is optional for retrieve token from azure web app service
     */
    clientId?: string;
    /**
     * A msi app service environment need to provide `msiEndpoint` for retriving the accesstoken.
     */
    msiEndpoint?: string;
    /**
     * A msi app service environment need to provide `msiSecret` for retriving the accesstoken.
     */
    msiSecret?: string;
  };
}

interface AzureActiveDirectoryMsiVmAuthentication {
  type: 'azure-active-directory-msi-vm';
  options: {
    /**
     * If you user want to connect to an Azure app service using a specific client account
     * they need to provide `clientId` asscoiate to their created idnetity.
     *
     * This is optional for retrieve token from azure web app service
     */
    clientId?: string;
    /**
     * A user need to provide `msiEndpoint` for retriving the accesstoken.
     */
    msiEndpoint?: string;
  };
}

interface AzureActiveDirectoryAccessTokenAuthentication {
  type: 'azure-active-directory-access-token';
  options: {
    /**
     * A user need to provide `token` which they retrived else where
     * to forming the connection.
     */
    token: string;
  };
}

interface AzureActiveDirectoryPasswordAuthentication {
  type: 'azure-active-directory-password';
  options: {
    /**
     * A user need to provide `userName` asscoiate to their account.
     */
    userName: string;
    /**
     * A user need to provide `password` asscoiate to their account.
     */
    password: string;
  };
}

interface AzureActiveDirectoryServicePrincipalSecret {
  type: 'azure-active-directory-service-principal-secret';
  options: {
    /**
     * Application (`client`) ID from your registered Azure application
     */
    clientId: string;
    /**
     * The created `client secret` for this registered Azure application
     */
    clientSecret: string;
    /**
     * Directory (`tenant`) ID from your registered Azure application
     */
    tenantId: string;
  };
}

interface NtlmAuthentication {
  type: 'ntlm';
  options: {
    /**
     * User name from your windows account.
     */
    userName: string;
    /**
     * Password from your windows account.
     */
    password: string;
    /**
     * Once you set domain for ntlm authentication type, driver will connect to SQL Server using domain login.
     *
     * This is necessary for forming a connection using ntlm type
     */
    domain: string;
  };
}

interface DefaultAuthentication {
  type: 'default';
  options: {
    /**
     * User name to use for sql server login.
     */
    userName?: string;
    /**
     * Password to use for sql server login.
     */
    password?: string;
  };
}

interface ErrorWithCode extends Error {
  code?: string;
}

interface InternalConnectionConfig {
  server: string;
  authentication: DefaultAuthentication | NtlmAuthentication | AzureActiveDirectoryPasswordAuthentication | AzureActiveDirectoryMsiAppServiceAuthentication | AzureActiveDirectoryMsiVmAuthentication | AzureActiveDirectoryAccessTokenAuthentication | AzureActiveDirectoryServicePrincipalSecret;
  options: InternalConnectionOptions;
}

export interface InternalConnectionOptions {
  abortTransactionOnError: boolean;
  appName: undefined | string;
  camelCaseColumns: boolean;
  cancelTimeout: number;
<<<<<<< HEAD
  columnEncryptionKeyCacheTTL: number;
  columnEncryptionSetting: boolean;
  columnNameReplacer: undefined| ((colName: string, index: number, metadata: Metadata) => string);
=======
  columnNameReplacer: undefined | ((colName: string, index: number, metadata: Metadata) => string);
>>>>>>> origin-master
  connectionRetryInterval: number;
  connectTimeout: number;
  connectionIsolationLevel: typeof ISOLATION_LEVEL[keyof typeof ISOLATION_LEVEL];
  cryptoCredentialsDetails: SecureContextOptions;
  database: undefined | string;
  datefirst: number;
  dateFormat: string;
  debug: {
    data: boolean;
    packet: boolean;
    payload: boolean;
    token: boolean;
  };
  enableAnsiNull: null | boolean;
  enableAnsiNullDefault: null | boolean;
  enableAnsiPadding: null | boolean;
  enableAnsiWarnings: null | boolean;
  enableArithAbort: null | boolean;
  enableConcatNullYieldsNull: null | boolean;
  enableCursorCloseOnCommit: null | boolean;
  enableImplicitTransactions: null | boolean;
  enableNumericRoundabort: null | boolean;
  enableQuotedIdentifier: null | boolean;
  encrypt: boolean;
  encryptionKeyStoreProviders?: KeyStoreProviderMap;
  fallbackToDefaultDb: boolean;
  instanceName: undefined | string;
  isolationLevel: typeof ISOLATION_LEVEL[keyof typeof ISOLATION_LEVEL];
  language: string;
  localAddress: undefined | string;
  maxRetriesOnTransientErrors: number;
  multiSubnetFailover: boolean;
  packetSize: number;
  port: undefined | number;
  readOnlyIntent: boolean;
  requestTimeout: number;
  rowCollectionOnDone: boolean;
  rowCollectionOnRequestCompletion: boolean;
  serverName: undefined | string;
  serverSupportsColumnEncryption: boolean;
  tdsVersion: string;
  textsize: string;
  trustedServerNameAE?: string;
  trustServerCertificate: boolean;
  useColumnNames: boolean;
  useUTC: boolean;
  validateBulkLoadParameters: boolean;
  workstationId: undefined | string;
  lowerCaseGuids: boolean;
}

<<<<<<< HEAD
interface KeyStoreProvider {
  key: string;
  value: ColumnEncryptionAzureKeyVaultProvider;
}

interface KeyStoreProviderMap {
  [key: string]: ColumnEncryptionAzureKeyVaultProvider;
}

=======
/**
 * @private
 */
>>>>>>> origin-master
interface State {
  name: string;
  enter?(this: Connection): void;
  exit?(this: Connection, newState: State): void;
  events: {
    socketError?(this: Connection, err: Error): void;
    connectTimeout?(this: Connection): void;
    socketConnect?(this: Connection): void;
    data?(this: Connection, data: Buffer): void;
    message?(this: Connection): void;
    retry?(this: Connection): void;
    routingChange?(this: Connection): void;
    reconnect?(this: Connection): void;
    featureExtAck?(this: Connection, token: FeatureExtAckToken): void;
    fedAuthInfo?(this: Connection, token: FedAuthInfoToken): void;
    endOfMessageMarkerReceived?(this: Connection): void;
    loginFailed?(this: Connection): void;
    attention?(this: Connection): void;
  };
}

type Authentication = DefaultAuthentication |
                      NtlmAuthentication |
                      AzureActiveDirectoryPasswordAuthentication |
                      AzureActiveDirectoryMsiAppServiceAuthentication |
                      AzureActiveDirectoryMsiVmAuthentication |
                      AzureActiveDirectoryAccessTokenAuthentication |
                      AzureActiveDirectoryServicePrincipalSecret;

type AuthenticationType = Authentication['type'];

export interface ConnectionConfiguration {
  /**
   * Hostname to connect to.
   */
  server: string;
  /**
   * Configuration options for forming the connection.
   */
  options?: ConnectionOptions;
  /**
   * Authentication realted options for connection.
   */
  authentication?: AuthenticationOptions;
}

interface DebugOptions {
  /**
   * A boolean, controlling whether [[debug]] events will be emitted with text describing packet data details
   *
   * (default: `false`)
   */
  data: boolean;
  /**
   * A boolean, controlling whether [[debug]] events will be emitted with text describing packet details
   *
   * (default: `false`)
   */
  packet: boolean;
  /**
   * A boolean, controlling whether [[debug]] events will be emitted with text describing packet payload details
   *
   * (default: `false`)
   */
  payload: boolean;
  /**
   * A boolean, controlling whether [[debug]] events will be emitted with text describing token stream tokens
   *
   * (default: `false`)
   */
  token: boolean;
  }

interface AuthenticationOptions {
  /**
   * Type of the authentication method, valid types are `default`, `ntlm`,
   * `azure-active-directory-password`, `azure-active-directory-access-token`,
   * `azure-active-directory-msi-vm`, `azure-active-directory-msi-app-service`,
   * or `azure-active-directory-service-principal-secret`
   */
   type?: AuthenticationType;
   /**
    * Different options for authentication types:
    *
    * * `default`: [[DefaultAuthentication.options]]
    * * `ntlm` :[[NtlmAuthentication]]
    * * `azure-active-directory-password` : [[AzureActiveDirectoryPasswordAuthentication.options]]
    * * `azure-active-directory-access-token` : [[AzureActiveDirectoryAccessTokenAuthentication.options]]
    * * `azure-active-directory-msi-vm` : [[AzureActiveDirectoryMsiVmAuthentication.options]]
    * * `azure-active-directory-msi-app-service` : [[AzureActiveDirectoryMsiAppServiceAuthentication.options]]
    * * `azure-active-directory-service-principal-secret` : [[AzureActiveDirectoryServicePrincipalSecret.options]]
    */
   options?: any;
}

interface ConnectionOptions {
  /**
   * A boolean determining whether to rollback a transaction automatically if any error is encountered
   * during the given transaction's execution. This sets the value for `SET XACT_ABORT` during the
   * initial SQL phase of a connection [documentation](https://docs.microsoft.com/en-us/sql/t-sql/statements/set-xact-abort-transact-sql).
   */
  abortTransactionOnError?: boolean;

  /**
   * Application name used for identifying a specific application in profiling, logging or tracing tools of SQLServer.
   *
   * (default: `Tedious`)
   */
  appName?: string | undefined;

  /**
   * A boolean, controlling whether the column names returned will have the first letter converted to lower case
   * (`true`) or not. This value is ignored if you provide a [[columnNameReplacer]].
   *
   * (default: `false`).
   */
  camelCaseColumns?: boolean;

  /**
   * The number of milliseconds before the [[Request.cancel]] (abort) of a request is considered failed
   *
   * (default: `5000`).
   */
  cancelTimeout?: number;
<<<<<<< HEAD
  columnEncryptionKeyCacheTTL: number;
  columnEncryptionSetting: boolean;
=======

  /**
   * A function with parameters `(columnName, index, columnMetaData)` and returning a string. If provided,
   * this will be called once per column per result-set. The returned value will be used instead of the SQL-provided
   * column name on row and meta data objects. This allows you to dynamically convert between naming conventions.
   *
   * (default: `null`)
   */
>>>>>>> origin-master
  columnNameReplacer?: (colName: string, index: number, metadata: Metadata) => string;

  /**
   * Number of milliseconds before retrying to establish connection, in case of transient failure.
   *
   * (default:`500`)
   */
  connectionRetryInterval?: number;

  /**
   * The number of milliseconds before the attempt to connect is considered failed
   *
   * (default: `15000`).
   */
  connectTimeout?: number;

  /**
   * The default isolation level for new connections. All out-of-transaction queries are executed with this setting.
   *
   * The isolation levels are available from `require('tedious').ISOLATION_LEVEL`.
   * * `READ_UNCOMMITTED`
   * * `READ_COMMITTED`
   * * `REPEATABLE_READ`
   * * `SERIALIZABLE`
   * * `SNAPSHOT`
   *
   * (default: `READ_COMMITED`).
   */
  connectionIsolationLevel?: number;

  /**
   * When encryption is used, an object may be supplied that will be used
   * for the first argument when calling [`tls.createSecurePair`](http://nodejs.org/docs/latest/api/tls.html#tls_tls_createsecurepair_credentials_isserver_requestcert_rejectunauthorized)
   *
   * (default: `{}`)
   */
  cryptoCredentialsDetails?: {};

  /**
   * Database to connect to (default: dependent on server configuration).
   */
  database?: string | undefined;

  /**
   * Sets the first day of the week to a number from 1 through 7.
   */
  datefirst?: number;

  /**
   * A string representing position of month, day and year in temporal datatypes.
   *
   * (default: `mdy`)
   */
  dateFormat?: string;

  debug?: DebugOptions;

  /**
   * A boolean, controls the way null values should be used during comparison operation.
   *
   * (default: `true`)
   */
  enableAnsiNull?: boolean;

  /**
   * If true, `SET ANSI_NULL_DFLT_ON ON` will be set in the initial sql. This means new columns will be
   * nullable by default. See the [T-SQL documentation](https://msdn.microsoft.com/en-us/library/ms187375.aspx)
   *
   * (default: `true`).
   */
  enableAnsiNullDefault?: boolean;

  /**
   * A boolean, controls if padding should be applied for values shorter than the size of defined column.
   *
   * (default: `true`)
   */
  enableAnsiPadding?: boolean;

  /**
   * If true, SQL Server will follow ISO standard behavior during various error conditions. For details,
   * see [documentation](https://docs.microsoft.com/en-us/sql/t-sql/statements/set-ansi-warnings-transact-sql)
   *
   * (default: `true`)
   */
  enableAnsiWarnings?: boolean;

  /**
   * Ends a query when an overflow or divide-by-zero error occurs during query execution.
   * See [documentation](https://docs.microsoft.com/en-us/sql/t-sql/statements/set-arithabort-transact-sql?view=sql-server-2017)
   * for more details.
   *
   * (default: `true`)
   */
  enableArithAbort?: boolean;

  /**
   * A boolean, determines if concatenation with NULL should result in NULL or empty string value, more details in
   * [documentation](https://docs.microsoft.com/en-us/sql/t-sql/statements/set-concat-null-yields-null-transact-sql)
   *
   * (default: `true`)
   */
  enableConcatNullYieldsNull?: boolean;

  /**
   * A boolean, controls whether cursor should be closed, if the transaction opening it gets committed or rolled
   * back.
   *
   * (default: `null`)
   */
  enableCursorCloseOnCommit?: boolean | null;

  /**
   * A boolean, sets the connection to either implicit or autocommit transaction mode.
   *
   * (default: `false`)
   */
  enableImplicitTransactions?: boolean;

  /**
   * If false, error is not generated during loss of precession.
   *
   * (default: `false`)
   */
  enableNumericRoundabort?: boolean;

  /**
   * If true, characters enclosed in single quotes are treated as literals and those enclosed double quotes are treated as identifiers.
   *
   * (default: `true`)
   */
  enableQuotedIdentifier?: boolean;

  /**
   * A boolean determining whether or not the connection will be encrypted. Set to `true` if you're on Windows Azure.
   *
   * (default: `false`)
   */
  encrypt?: boolean;
<<<<<<< HEAD
  encryptionKeyStoreProviders?: KeyStoreProvider[];
=======

  /**
   * By default, if the database requested by [[database]] cannot be accessed,
   * the connection will fail with an error. However, if [[fallbackToDefaultDb]] is
   * set to `true`, then the user's default database will be used instead
   *
   * (default: `false`)
   */
>>>>>>> origin-master
  fallbackToDefaultDb?: boolean;

  /**
   * The instance name to connect to.
   * The SQL Server Browser service must be running on the database server,
   * and UDP port 1434 on the database server must be reachable.
   *
   * (no default)
   *
   * Mutually exclusive with [[port]].
   */
  instanceName?: string | undefined;

  /**
   * The default isolation level that transactions will be run with.
   *
   * The isolation levels are available from `require('tedious').ISOLATION_LEVEL`.
   * * `READ_UNCOMMITTED`
   * * `READ_COMMITTED`
   * * `REPEATABLE_READ`
   * * `SERIALIZABLE`
   * * `SNAPSHOT`
   *
   * (default: `READ_COMMITED`).
   */
  isolationLevel?: number;

  /**
   * Specifies the language environment for the session. The session language determines the datetime formats and system messages.
   *
   * (default: `us_english`).
   */
  language?: string;

  /**
   * A string indicating which network interface (ip address) to use when connecting to SQL Server.
   */
  localAddress?: string | undefined;

  /**
   * The maximum number of connection retries for transient errors.、
   *
   * (default: `3`).
   */
  maxRetriesOnTransientErrors?: number;

  /**
   * Sets the MultiSubnetFailover = True parameter, which can help minimize the client recovery latency when failovers occur.
   *
   * (default: `false`).
   */
  multiSubnetFailover?: boolean;

  /**
   * The size of TDS packets (subject to negotiation with the server).
   * Should be a power of 2.
   *
   * (default: `4096`).
   */
  packetSize?: number;

  /**
   * Port to connect to (default: `1433`).
   *
   * Mutually exclusive with [[instanceName]]
   */
  port?: number;

  /**
   * A boolean, determining whether the connection will request read only access from a SQL Server Availability
   * Group. For more information, see [here](http://msdn.microsoft.com/en-us/library/hh710054.aspx "Microsoft: Configure Read-Only Routing for an Availability Group (SQL Server)")
   *
   * (default: `false`).
   */
  readOnlyIntent?: boolean;

  /**
   * The number of milliseconds before a request is considered failed, or `0` for no timeout
   *
   * (default: `15000`).
   */
  requestTimeout?: number;

  /**
   * A boolean, that when true will expose received rows in Requests done related events:
   * * [[Request.Event_doneInProc]]
   * * [[Request.Event_doneProc]]
   * * [[Request.Event_done]]
   *
   * (default: `false`)
   *
   * Caution: If many row are received, enabling this option could result in
   * excessive memory usage.
   */
  rowCollectionOnDone?: boolean;

  /**
   * A boolean, that when true will expose received rows in Requests' completion callback.See [[Request.constructor]].
   *
   * (default: `false`)
   *
   * Caution: If many row are received, enabling this option could result in
   * excessive memory usage.
   */
  rowCollectionOnRequestCompletion?: boolean;

  /**
   * The version of TDS to use. If server doesn't support specified version, negotiated version is used instead.
   *
   * The versions are available from `require('tedious').TDS_VERSION`.
   * * `7_1`
   * * `7_2`
   * * `7_3_A`
   * * `7_3_B`
   * * `7_4`
   *
   * (default: `7_4`)
   */
  tdsVersion?: string;

  /**
   * Specifies the size of varchar(max), nvarchar(max), varbinary(max), text, ntext, and image data returned by a SELECT statement.
   *
   * (default: `2147483647`)
   */
  textsize?: string;

  /**
   * If "true", the SQL Server SSL certificate is automatically trusted when the communication layer is encrypted using SSL.
   *
   * If "false", the SQL Server validates the server SSL certificate. If the server certificate validation fails,
   * the driver raises an error and terminates the connection. Make sure the value passed to serverName exactly
   * matches the Common Name (CN) or DNS name in the Subject Alternate Name in the server certificate for an SSL connection to succeed.
   *
   * (default: `true`)
   */
  trustServerCertificate?: boolean;

  /**
   * A boolean determining whether to return rows as arrays or key-value collections.
   *
   * (default: `false`).
   */
  useColumnNames?: boolean;

  /**
   * A boolean determining whether to pass time values in UTC or local time.
   *
   * (default: `true`).
   */
  useUTC?: boolean;

  /**
   * A boolean determining whether BulkLoad parameters should be validated.
   *
   * (default: `false`).
   */
  validateBulkLoadParameters?: boolean;

  /**
   * The workstation ID (WSID) of the client, default os.hostname().
   * Used for identifying a specific client in profiling, logging or
   * tracing client activity in SQLServer.
   *
   * The value is reported by the TSQL function HOST_NAME().
   */
  workstationId?: string | undefined;

  /**
   * A boolean determining whether to parse unique identifier type with lowercase case characters.
   *
   * (default: `false`).
   */
  lowerCaseGuids?: boolean;
}

/**
 * @private
 */
const CLEANUP_TYPE = {
  NORMAL: 0,
  REDIRECT: 1,
  RETRY: 2
};

/**
 * A [[Connection]] instance represents a single connection to a database server.
 *
 * ```js
 * var Connection = require('tedious').Connection;
 * var config = {
 *  "authentication": {
 *    ...,
 *    "options": {...}
 *  },
 *  "options": {...}
 * };
 * var connection = new Connection(config);
 * ```
 *
 * Only one request at a time may be executed on a connection. Once a [[Request]]
 * has been initiated (with [[Connection.callProcedure]], [[Connection.execSql]],
 * or [[Connection.execSqlBatch]]), another should not be initiated until the
 * [[Request]]'s completion callback is called.
 */
class Connection extends EventEmitter {
  /**
   * @private
   */
  fedAuthRequired: boolean;
  /**
   * @private
   */
  fedAuthInfoToken: undefined | FedAuthInfoToken;
  /**
   * @private
   */
  config: InternalConnectionConfig;
  /**
   * @private
   */
  secureContext: SecureContext;
  /**
   * @private
   */
  inTransaction: boolean;
  /**
   * @private
   */
  transactionDescriptors: Buffer[];
  /**
   * @private
   */
  transactionDepth: number;
  /**
   * @private
   */
  isSqlBatch: boolean;
  /**
   * @private
   */
  curTransientRetryCount: number;
  /**
   * @private
   */
  transientErrorLookup: TransientErrorLookup;
  /**
   * @private
   */
  closed: boolean;
  /**
   * @private
   */
  loggedIn: boolean;
  /**
   * @private
   */
  loginError: undefined | ConnectionError;
  /**
   * @private
   */
  debug: Debug;
  /**
   * @private
   */
  tokenStreamParser: TokenStreamParser;
  /**
   * @private
   */
  ntlmpacket: undefined | any;
  /**
   * @private
   */
  ntlmpacketBuffer: undefined | Buffer;

  /**
   * @private
   */
  STATE!: {
    INITIALIZED: State;
    CONNECTING: State;
    SENT_PRELOGIN: State;
    REROUTING: State;
    TRANSIENT_FAILURE_RETRY: State;
    SENT_TLSSSLNEGOTIATION: State;
    SENT_LOGIN7_WITH_STANDARD_LOGIN: State;
    SENT_LOGIN7_WITH_NTLM: State;
    SENT_LOGIN7_WITH_FEDAUTH: State;
    LOGGED_IN_SENDING_INITIAL_SQL: State;
    LOGGED_IN: State;
    SENT_CLIENT_REQUEST: State;
    SENT_ATTENTION: State;
    FINAL: State;
  }

  /**
   * @private
   */
  routingData: any;
  /**
   * @private
   */
  messageIo!: MessageIO;
  /**
   * @private
   */
  state: State;
  /**
   * @private
   */
  resetConnectionOnNextRequest: undefined | boolean;
  /**
   * @private
   */
  attentionReceived: undefined | boolean;

  /**
   * @private
   */
  request: undefined | Request | BulkLoad;
  /**
   * @private
   */
  procReturnStatusValue: undefined | any;
  /**
   * @private
   */
  socket: undefined | Socket;
  /**
   * @private
   */
  messageBuffer: Buffer;

  /**
   * @private
   */
  connectTimer: undefined | NodeJS.Timeout;
  /**
   * @private
   */
  cancelTimer: undefined | NodeJS.Timeout;
  /**
   * @private
   */
  requestTimer: undefined | NodeJS.Timeout;
  /**
   * @private
   */
  retryTimer: undefined | NodeJS.Timeout;

  /**
   * Note: be aware of the different options field:
   * 1. config.authentication.options
   * 2. config.options
   *
   * ```js
   * const { Connection } = require('tedious');
   *
   * const config = {
   *  "authentication": {
   *    ...,
   *    "options": {...}
   *  },
   *  "options": {...}
   * };
   *
   * const connection = new Connection(config);
   * ```
   *
   * @param config
   */
  constructor(config: ConnectionConfiguration) {
    super();

    if (typeof config !== 'object' || config === null) {
      throw new TypeError('The "config" argument is required and must be of type Object.');
    }

    if (typeof config.server !== 'string') {
      throw new TypeError('The "config.server" property is required and must be of type string.');
    }

    this.fedAuthRequired = false;
    this.fedAuthInfoToken = undefined;

    let authentication: InternalConnectionConfig['authentication'];
    if (config.authentication !== undefined) {
      if (typeof config.authentication !== 'object' || config.authentication === null) {
        throw new TypeError('The "config.authentication" property must be of type Object.');
      }

      const type = config.authentication.type;
      const options = config.authentication.options === undefined ? {} : config.authentication.options;

      if (typeof type !== 'string') {
        throw new TypeError('The "config.authentication.type" property must be of type string.');
      }

      if (type !== 'default' && type !== 'ntlm' && type !== 'azure-active-directory-password' && type !== 'azure-active-directory-access-token' && type !== 'azure-active-directory-msi-vm' && type !== 'azure-active-directory-msi-app-service' && type !== 'azure-active-directory-service-principal-secret') {
        throw new TypeError('The "type" property must one of "default", "ntlm", "azure-active-directory-password", "azure-active-directory-access-token", "azure-active-directory-msi-vm" or "azure-active-directory-msi-app-service" or "azure-active-directory-service-principal-secret".');
      }

      if (typeof options !== 'object' || options === null) {
        throw new TypeError('The "config.authentication.options" property must be of type object.');
      }

      if (type === 'ntlm') {
        if (typeof options.domain !== 'string') {
          throw new TypeError('The "config.authentication.options.domain" property must be of type string.');
        }

        if (options.userName !== undefined && typeof options.userName !== 'string') {
          throw new TypeError('The "config.authentication.options.userName" property must be of type string.');
        }

        if (options.password !== undefined && typeof options.password !== 'string') {
          throw new TypeError('The "config.authentication.options.password" property must be of type string.');
        }

        authentication = {
          type: 'ntlm',
          options: {
            userName: options.userName,
            password: options.password,
            domain: options.domain && options.domain.toUpperCase()
          }
        };
      } else if (type === 'azure-active-directory-password') {
        if (options.userName !== undefined && typeof options.userName !== 'string') {
          throw new TypeError('The "config.authentication.options.userName" property must be of type string.');
        }

        if (options.password !== undefined && typeof options.password !== 'string') {
          throw new TypeError('The "config.authentication.options.password" property must be of type string.');
        }

        authentication = {
          type: 'azure-active-directory-password',
          options: {
            userName: options.userName,
            password: options.password,
          }
        };
      } else if (type === 'azure-active-directory-access-token') {
        if (typeof options.token !== 'string') {
          throw new TypeError('The "config.authentication.options.token" property must be of type string.');
        }

        authentication = {
          type: 'azure-active-directory-access-token',
          options: {
            token: options.token
          }
        };
      } else if (type === 'azure-active-directory-msi-vm') {
        if (options.clientId !== undefined && typeof options.clientId !== 'string') {
          throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
        }

        if (options.msiEndpoint !== undefined && typeof options.msiEndpoint !== 'string') {
          throw new TypeError('The "config.authentication.options.msiEndpoint" property must be of type string.');
        }

        authentication = {
          type: 'azure-active-directory-msi-vm',
          options: {
            clientId: options.clientId,
            msiEndpoint: options.msiEndpoint
          }
        };
      } else if (type === 'azure-active-directory-msi-app-service') {
        if (options.clientId !== undefined && typeof options.clientId !== 'string') {
          throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
        }

        if (options.msiEndpoint !== undefined && typeof options.msiEndpoint !== 'string') {
          throw new TypeError('The "config.authentication.options.msiEndpoint" property must be of type string.');
        }

        if (options.msiSecret !== undefined && typeof options.msiSecret !== 'string') {
          throw new TypeError('The "config.authentication.options.msiSecret" property must be of type string.');
        }

        authentication = {
          type: 'azure-active-directory-msi-app-service',
          options: {
            clientId: options.clientId,
            msiEndpoint: options.msiEndpoint,
            msiSecret: options.msiSecret
          }
        };
      } else if (type === 'azure-active-directory-service-principal-secret') {
        if (typeof options.clientId !== 'string') {
          throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
        }

        if (typeof options.clientSecret !== 'string') {
          throw new TypeError('The "config.authentication.options.clientSecret" property must be of type string.');
        }

        if (typeof options.tenantId !== 'string') {
          throw new TypeError('The "config.authentication.options.tenantId" property must be of type string.');
        }

        authentication = {
          type: 'azure-active-directory-service-principal-secret',
          options: {
            clientId: options.clientId,
            clientSecret: options.clientSecret,
            tenantId: options.tenantId
          }
        };
      } else {
        if (options.userName !== undefined && typeof options.userName !== 'string') {
          throw new TypeError('The "config.authentication.options.userName" property must be of type string.');
        }

        if (options.password !== undefined && typeof options.password !== 'string') {
          throw new TypeError('The "config.authentication.options.password" property must be of type string.');
        }

        authentication = {
          type: 'default',
          options: {
            userName: options.userName,
            password: options.password
          }
        };
      }
    } else {
      authentication = {
        type: 'default',
        options: {
          userName: undefined,
          password: undefined
        }
      };
    }

    this.config = {
      server: config.server,
      authentication: authentication,
      options: {
        abortTransactionOnError: false,
        appName: undefined,
        camelCaseColumns: false,
        cancelTimeout: DEFAULT_CANCEL_TIMEOUT,
        columnEncryptionKeyCacheTTL: 2 * 60 * 60 * 1000,  // Units: miliseconds
        columnEncryptionSetting: false,
        columnNameReplacer: undefined,
        connectionRetryInterval: DEFAULT_CONNECT_RETRY_INTERVAL,
        connectTimeout: DEFAULT_CONNECT_TIMEOUT,
        connectionIsolationLevel: ISOLATION_LEVEL.READ_COMMITTED,
        cryptoCredentialsDetails: {},
        database: undefined,
        datefirst: DEFAULT_DATEFIRST,
        dateFormat: DEFAULT_DATEFORMAT,
        debug: {
          data: false,
          packet: false,
          payload: false,
          token: false
        },
        enableAnsiNull: true,
        enableAnsiNullDefault: true,
        enableAnsiPadding: true,
        enableAnsiWarnings: true,
        enableArithAbort: true,
        enableConcatNullYieldsNull: true,
        enableCursorCloseOnCommit: null,
        enableImplicitTransactions: false,
        enableNumericRoundabort: false,
        enableQuotedIdentifier: true,
        encrypt: true,
        fallbackToDefaultDb: false,
        encryptionKeyStoreProviders: undefined,
        instanceName: undefined,
        isolationLevel: ISOLATION_LEVEL.READ_COMMITTED,
        language: DEFAULT_LANGUAGE,
        localAddress: undefined,
        maxRetriesOnTransientErrors: 3,
        multiSubnetFailover: false,
        packetSize: DEFAULT_PACKET_SIZE,
        port: DEFAULT_PORT,
        readOnlyIntent: false,
        requestTimeout: DEFAULT_CLIENT_REQUEST_TIMEOUT,
        rowCollectionOnDone: false,
        rowCollectionOnRequestCompletion: false,
        serverName: undefined,
        serverSupportsColumnEncryption: false,
        tdsVersion: DEFAULT_TDS_VERSION,
        textsize: DEFAULT_TEXTSIZE,
<<<<<<< HEAD
        trustedServerNameAE: undefined,
        trustServerCertificate: true,
=======
        trustServerCertificate: false,
>>>>>>> origin-master
        useColumnNames: false,
        useUTC: true,
        validateBulkLoadParameters: false,
        workstationId: undefined,
        lowerCaseGuids: false
      }
    };

    if (config.options) {
      if (config.options.port && config.options.instanceName) {
        throw new Error('Port and instanceName are mutually exclusive, but ' + config.options.port + ' and ' + config.options.instanceName + ' provided');
      }

      if (config.options.abortTransactionOnError !== undefined) {
        if (typeof config.options.abortTransactionOnError !== 'boolean' && config.options.abortTransactionOnError !== null) {
          throw new TypeError('The "config.options.abortTransactionOnError" property must be of type string or null.');
        }

        this.config.options.abortTransactionOnError = config.options.abortTransactionOnError;
      }

      if (config.options.appName !== undefined) {
        if (typeof config.options.appName !== 'string') {
          throw new TypeError('The "config.options.appName" property must be of type string.');
        }

        this.config.options.appName = config.options.appName;
      }

      if (config.options.camelCaseColumns !== undefined) {
        if (typeof config.options.camelCaseColumns !== 'boolean') {
          throw new TypeError('The "config.options.camelCaseColumns" property must be of type boolean.');
        }

        this.config.options.camelCaseColumns = config.options.camelCaseColumns;
      }

      if (config.options.cancelTimeout !== undefined) {
        if (typeof config.options.cancelTimeout !== 'number') {
          throw new TypeError('The "config.options.cancelTimeout" property must be of type number.');
        }

        this.config.options.cancelTimeout = config.options.cancelTimeout;
      }

      if (config.options.columnNameReplacer) {
        if (typeof config.options.columnNameReplacer !== 'function') {
          throw new TypeError('The "config.options.cancelTimeout" property must be of type function.');
        }

        this.config.options.columnNameReplacer = config.options.columnNameReplacer;
      }

      if (config.options.connectTimeout !== undefined) {
        if (typeof config.options.connectTimeout !== 'number') {
          throw new TypeError('The "config.options.connectTimeout" property must be of type number.');
        }

        this.config.options.connectTimeout = config.options.connectTimeout;
      }

      if (config.options.connectionIsolationLevel !== undefined) {
        assertValidIsolationLevel(config.options.connectionIsolationLevel, 'config.options.connectionIsolationLevel');

        this.config.options.connectionIsolationLevel = config.options.connectionIsolationLevel;
      }

      if (config.options.connectTimeout !== undefined) {
        if (typeof config.options.connectTimeout !== 'number') {
          throw new TypeError('The "config.options.connectTimeout" property must be of type number.');
        }

        this.config.options.connectTimeout = config.options.connectTimeout;
      }

      if (config.options.cryptoCredentialsDetails !== undefined) {
        if (typeof config.options.cryptoCredentialsDetails !== 'object' || config.options.cryptoCredentialsDetails === null) {
          throw new TypeError('The "config.options.cryptoCredentialsDetails" property must be of type Object.');
        }

        this.config.options.cryptoCredentialsDetails = config.options.cryptoCredentialsDetails;
      }

      if (config.options.database !== undefined) {
        if (typeof config.options.database !== 'string') {
          throw new TypeError('The "config.options.database" property must be of type string.');
        }

        this.config.options.database = config.options.database;
      }

      if (config.options.datefirst !== undefined) {
        if (typeof config.options.datefirst !== 'number' && config.options.datefirst !== null) {
          throw new TypeError('The "config.options.datefirst" property must be of type number.');
        }

        if (config.options.datefirst !== null && (config.options.datefirst < 1 || config.options.datefirst > 7)) {
          throw new RangeError('The "config.options.datefirst" property must be >= 1 and <= 7');
        }

        this.config.options.datefirst = config.options.datefirst;
      }

      if (config.options.dateFormat !== undefined) {
        if (typeof config.options.dateFormat !== 'string' && config.options.dateFormat !== null) {
          throw new TypeError('The "config.options.dateFormat" property must be of type string or null.');
        }

        this.config.options.dateFormat = config.options.dateFormat;
      }

      if (config.options.debug) {
        if (config.options.debug.data !== undefined) {
          if (typeof config.options.debug.data !== 'boolean') {
            throw new TypeError('The "config.options.debug.data" property must be of type boolean.');
          }

          this.config.options.debug.data = config.options.debug.data;
        }

        if (config.options.debug.packet !== undefined) {
          if (typeof config.options.debug.packet !== 'boolean') {
            throw new TypeError('The "config.options.debug.packet" property must be of type boolean.');
          }

          this.config.options.debug.packet = config.options.debug.packet;
        }

        if (config.options.debug.payload !== undefined) {
          if (typeof config.options.debug.payload !== 'boolean') {
            throw new TypeError('The "config.options.debug.payload" property must be of type boolean.');
          }

          this.config.options.debug.payload = config.options.debug.payload;
        }

        if (config.options.debug.token !== undefined) {
          if (typeof config.options.debug.token !== 'boolean') {
            throw new TypeError('The "config.options.debug.token" property must be of type boolean.');
          }

          this.config.options.debug.token = config.options.debug.token;
        }
      }

      if (config.options.enableAnsiNull !== undefined) {
        if (typeof config.options.enableAnsiNull !== 'boolean' && config.options.enableAnsiNull !== null) {
          throw new TypeError('The "config.options.enableAnsiNull" property must be of type boolean or null.');
        }

        this.config.options.enableAnsiNull = config.options.enableAnsiNull;
      }

      if (config.options.enableAnsiNullDefault !== undefined) {
        if (typeof config.options.enableAnsiNullDefault !== 'boolean' && config.options.enableAnsiNullDefault !== null) {
          throw new TypeError('The "config.options.enableAnsiNullDefault" property must be of type boolean or null.');
        }

        this.config.options.enableAnsiNullDefault = config.options.enableAnsiNullDefault;
      }

      if (config.options.enableAnsiPadding !== undefined) {
        if (typeof config.options.enableAnsiPadding !== 'boolean' && config.options.enableAnsiPadding !== null) {
          throw new TypeError('The "config.options.enableAnsiPadding" property must be of type boolean or null.');
        }

        this.config.options.enableAnsiPadding = config.options.enableAnsiPadding;
      }

      if (config.options.enableAnsiWarnings !== undefined) {
        if (typeof config.options.enableAnsiWarnings !== 'boolean' && config.options.enableAnsiWarnings !== null) {
          throw new TypeError('The "config.options.enableAnsiWarnings" property must be of type boolean or null.');
        }

        this.config.options.enableAnsiWarnings = config.options.enableAnsiWarnings;
      }

      if (config.options.enableArithAbort !== undefined) {
        if (typeof config.options.enableArithAbort !== 'boolean' && config.options.enableArithAbort !== null) {
          throw new TypeError('The "config.options.enableArithAbort" property must be of type boolean or null.');
        }

        this.config.options.enableArithAbort = config.options.enableArithAbort;
      }

      if (config.options.enableConcatNullYieldsNull !== undefined) {
        if (typeof config.options.enableConcatNullYieldsNull !== 'boolean' && config.options.enableConcatNullYieldsNull !== null) {
          throw new TypeError('The "config.options.enableConcatNullYieldsNull" property must be of type boolean or null.');
        }

        this.config.options.enableConcatNullYieldsNull = config.options.enableConcatNullYieldsNull;
      }

      if (config.options.enableCursorCloseOnCommit !== undefined) {
        if (typeof config.options.enableCursorCloseOnCommit !== 'boolean' && config.options.enableCursorCloseOnCommit !== null) {
          throw new TypeError('The "config.options.enableCursorCloseOnCommit" property must be of type boolean or null.');
        }

        this.config.options.enableCursorCloseOnCommit = config.options.enableCursorCloseOnCommit;
      }

      if (config.options.enableImplicitTransactions !== undefined) {
        if (typeof config.options.enableImplicitTransactions !== 'boolean' && config.options.enableImplicitTransactions !== null) {
          throw new TypeError('The "config.options.enableImplicitTransactions" property must be of type boolean or null.');
        }

        this.config.options.enableImplicitTransactions = config.options.enableImplicitTransactions;
      }

      if (config.options.enableNumericRoundabort !== undefined) {
        if (typeof config.options.enableNumericRoundabort !== 'boolean' && config.options.enableNumericRoundabort !== null) {
          throw new TypeError('The "config.options.enableNumericRoundabort" property must be of type boolean or null.');
        }

        this.config.options.enableNumericRoundabort = config.options.enableNumericRoundabort;
      }

      if (config.options.enableQuotedIdentifier !== undefined) {
        if (typeof config.options.enableQuotedIdentifier !== 'boolean' && config.options.enableQuotedIdentifier !== null) {
          throw new TypeError('The "config.options.enableQuotedIdentifier" property must be of type boolean or null.');
        }

        this.config.options.enableQuotedIdentifier = config.options.enableQuotedIdentifier;
      }

      if (config.options.encrypt !== undefined) {
        if (typeof config.options.encrypt !== 'boolean') {
          throw new TypeError('The "config.options.encrypt" property must be of type boolean.');
        }

        this.config.options.encrypt = config.options.encrypt;
      }

      if (config.options.fallbackToDefaultDb !== undefined) {
        if (typeof config.options.fallbackToDefaultDb !== 'boolean') {
          throw new TypeError('The "config.options.fallbackToDefaultDb" property must be of type boolean.');
        }

        this.config.options.fallbackToDefaultDb = config.options.fallbackToDefaultDb;
      }

      if (config.options.instanceName !== undefined) {
        if (typeof config.options.instanceName !== 'string') {
          throw new TypeError('The "config.options.instanceName" property must be of type string.');
        }

        this.config.options.instanceName = config.options.instanceName;
        this.config.options.port = undefined;
      }

      if (config.options.isolationLevel !== undefined) {
        assertValidIsolationLevel(config.options.isolationLevel, 'config.options.isolationLevel');

        this.config.options.isolationLevel = config.options.isolationLevel;
      }

      if (config.options.language !== undefined) {
        if (typeof config.options.language !== 'string' && config.options.language !== null) {
          throw new TypeError('The "config.options.language" property must be of type string or null.');
        }

        this.config.options.language = config.options.language;
      }

      if (config.options.localAddress !== undefined) {
        if (typeof config.options.localAddress !== 'string') {
          throw new TypeError('The "config.options.localAddress" property must be of type string.');
        }

        this.config.options.localAddress = config.options.localAddress;
      }

      if (config.options.multiSubnetFailover !== undefined) {
        if (typeof config.options.multiSubnetFailover !== 'boolean') {
          throw new TypeError('The "config.options.multiSubnetFailover" property must be of type boolean.');
        }

        this.config.options.multiSubnetFailover = config.options.multiSubnetFailover;
      }

      if (config.options.packetSize !== undefined) {
        if (typeof config.options.packetSize !== 'number') {
          throw new TypeError('The "config.options.packetSize" property must be of type number.');
        }

        this.config.options.packetSize = config.options.packetSize;
      }

      if (config.options.port !== undefined) {
        if (typeof config.options.port !== 'number') {
          throw new TypeError('The "config.options.port" property must be of type number.');
        }

        if (config.options.port <= 0 || config.options.port >= 65536) {
          throw new RangeError('The "config.options.port" property must be > 0 and < 65536');
        }

        this.config.options.port = config.options.port;
        this.config.options.instanceName = undefined;
      }

      if (config.options.readOnlyIntent !== undefined) {
        if (typeof config.options.readOnlyIntent !== 'boolean') {
          throw new TypeError('The "config.options.readOnlyIntent" property must be of type boolean.');
        }

        this.config.options.readOnlyIntent = config.options.readOnlyIntent;
      }

      if (config.options.requestTimeout !== undefined) {
        if (typeof config.options.requestTimeout !== 'number') {
          throw new TypeError('The "config.options.requestTimeout" property must be of type number.');
        }

        this.config.options.requestTimeout = config.options.requestTimeout;
      }

      if (config.options.maxRetriesOnTransientErrors !== undefined) {
        if (typeof config.options.maxRetriesOnTransientErrors !== 'number') {
          throw new TypeError('The "config.options.maxRetriesOnTransientErrors" property must be of type number.');
        }

        if (config.options.maxRetriesOnTransientErrors < 0) {
          throw new TypeError('The "config.options.maxRetriesOnTransientErrors" property must be equal or greater than 0.');
        }

        this.config.options.maxRetriesOnTransientErrors = config.options.maxRetriesOnTransientErrors;
      }

      if (config.options.connectionRetryInterval !== undefined) {
        if (typeof config.options.connectionRetryInterval !== 'number') {
          throw new TypeError('The "config.options.connectionRetryInterval" property must be of type number.');
        }

        if (config.options.connectionRetryInterval <= 0) {
          throw new TypeError('The "config.options.connectionRetryInterval" property must be greater than 0.');
        }

        this.config.options.connectionRetryInterval = config.options.connectionRetryInterval;
      }

      if (config.options.rowCollectionOnDone !== undefined) {
        if (typeof config.options.rowCollectionOnDone !== 'boolean') {
          throw new TypeError('The "config.options.rowCollectionOnDone" property must be of type boolean.');
        }

        this.config.options.rowCollectionOnDone = config.options.rowCollectionOnDone;
      }

      if (config.options.rowCollectionOnRequestCompletion !== undefined) {
        if (typeof config.options.rowCollectionOnRequestCompletion !== 'boolean') {
          throw new TypeError('The "config.options.rowCollectionOnRequestCompletion" property must be of type boolean.');
        }

        this.config.options.rowCollectionOnRequestCompletion = config.options.rowCollectionOnRequestCompletion;
      }

      if (config.options.tdsVersion !== undefined) {
        if (typeof config.options.tdsVersion !== 'string') {
          throw new TypeError('The "config.options.tdsVersion" property must be of type string.');
        }

        this.config.options.tdsVersion = config.options.tdsVersion;
      }

      if (config.options.textsize !== undefined) {
        if (typeof config.options.textsize !== 'number' && config.options.textsize !== null) {
          throw new TypeError('The "config.options.textsize" property must be of type number or null.');
        }

        this.config.options.textsize = config.options.textsize;
      }

      if (config.options.trustServerCertificate !== undefined) {
        if (typeof config.options.trustServerCertificate !== 'boolean') {
          throw new TypeError('The "config.options.trustServerCertificate" property must be of type boolean.');
        }

        this.config.options.trustServerCertificate = config.options.trustServerCertificate;
      }

      if (config.options.useColumnNames !== undefined) {
        if (typeof config.options.useColumnNames !== 'boolean') {
          throw new TypeError('The "config.options.useColumnNames" property must be of type boolean.');
        }

        this.config.options.useColumnNames = config.options.useColumnNames;
      }

      if (config.options.useUTC !== undefined) {
        if (typeof config.options.useUTC !== 'boolean') {
          throw new TypeError('The "config.options.useUTC" property must be of type boolean.');
        }

        this.config.options.useUTC = config.options.useUTC;
      }

<<<<<<< HEAD
      if (config.options.columnEncryptionSetting !== undefined) {
        if (typeof config.options.columnEncryptionSetting !== 'boolean') {
          throw new TypeError('The "config.options.columnEncryptionSetting" property must be of type boolean.');
        }

        this.config.options.columnEncryptionSetting = config.options.columnEncryptionSetting;
      }

      if (config.options.columnEncryptionKeyCacheTTL !== undefined) {
        if (typeof config.options.columnEncryptionKeyCacheTTL !== 'number') {
          throw new TypeError('The "config.options.columnEncryptionKeyCacheTTL" property must be of type number.');
        }

        if (config.options.columnEncryptionKeyCacheTTL <= 0) {
          throw new TypeError('The "config.options.columnEncryptionKeyCacheTTL" property must be greater than 0.');
        }

        this.config.options.columnEncryptionKeyCacheTTL = config.options.columnEncryptionKeyCacheTTL;
=======
      if (config.options.validateBulkLoadParameters !== undefined) {
        if (typeof config.options.validateBulkLoadParameters !== 'boolean') {
          throw new TypeError('The "config.options.validateBulkLoadParameters" property must be of type boolean.');
        }

        this.config.options.validateBulkLoadParameters = config.options.validateBulkLoadParameters;
      } else {
        deprecate('The default value for "config.options.validateBulkLoadParameters" will change from `false` to `true` in the next major version of `tedious`. Set the value to `true` or `false` explicitly to silence this message.');
      }

      if (config.options.workstationId !== undefined) {
        if (typeof config.options.workstationId !== 'string') {
          throw new TypeError('The "config.options.workstationId" property must be of type string.');
        }

        this.config.options.workstationId = config.options.workstationId;
>>>>>>> origin-master
      }

      if (config.options.lowerCaseGuids !== undefined) {
        if (typeof config.options.lowerCaseGuids !== 'boolean') {
          throw new TypeError('The "config.options.lowerCaseGuids" property must be of type boolean.');
        }

        this.config.options.lowerCaseGuids = config.options.lowerCaseGuids;
      }

      if (config.options.encryptionKeyStoreProviders) {
        for (const entry of config.options.encryptionKeyStoreProviders) {
          const providerName = entry.key;

          if (!providerName || providerName.length === 0) {
            throw new TypeError('Invalid key store provider name specified. Key store provider names cannot be null or empty.');
          }

          if (providerName.substring(0, 6).toUpperCase().localeCompare('MSSQL_') === 0) {
            throw new TypeError(`Invalid key store provider name ${providerName}. MSSQL_ prefix is reserved for system key store providers.`);
          }

          if (!entry.value) {
            throw new TypeError(`Null reference specified for key store provider ${providerName}. Expecting a non-null value.`);
          }

          if (!this.config.options.encryptionKeyStoreProviders) {
            this.config.options.encryptionKeyStoreProviders = {};
          }

          this.config.options.encryptionKeyStoreProviders[providerName] = entry.value;
        }
      }
    }

    let serverName = this.config.server;
    if (!serverName) {
      serverName = 'localhost';
    }

    const px = serverName.indexOf('\\');

    if (px > 0) {
      serverName = serverName.substring(0, px);
    }

    this.config.options.trustedServerNameAE = serverName;

    if (this.config.options.instanceName) {
      this.config.options.trustedServerNameAE = `${this.config.options.trustedServerNameAE}:${this.config.options.instanceName}`;
    }

    if (this.config.options.port) {
      this.config.options.trustedServerNameAE = `${this.config.options.trustedServerNameAE}:${this.config.options.port}`;
    }

    let credentialsDetails = this.config.options.cryptoCredentialsDetails;
    if (credentialsDetails.secureOptions === undefined) {
      // If the caller has not specified their own `secureOptions`,
      // we set `SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS` here.
      // Older SQL Server instances running on older Windows versions have
      // trouble with the BEAST workaround in OpenSSL.
      // As BEAST is a browser specific exploit, we can just disable this option here.
      credentialsDetails = Object.create(credentialsDetails, {
        secureOptions: {
          value: constants.SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS
        }
      });
    }

    this.secureContext = createSecureContext(credentialsDetails);

    this.debug = this.createDebug();
    this.tokenStreamParser = this.createTokenStreamParser();
    this.inTransaction = false;
    this.transactionDescriptors = [Buffer.from([0, 0, 0, 0, 0, 0, 0, 0])];

    // 'beginTransaction', 'commitTransaction' and 'rollbackTransaction'
    // events are utilized to maintain inTransaction property state which in
    // turn is used in managing transactions. These events are only fired for
    // TDS version 7.2 and beyond. The properties below are used to emulate
    // equivalent behavior for TDS versions before 7.2.
    this.transactionDepth = 0;
    this.isSqlBatch = false;
    this.closed = false;
    this.loggedIn = false;
    this.messageBuffer = Buffer.alloc(0);

    this.curTransientRetryCount = 0;
    this.transientErrorLookup = new TransientErrorLookup();

    this.state = this.STATE.INITIALIZED;

    process.nextTick(() => {
      if (this.state === this.STATE.INITIALIZED) {
        const message = 'In the next major version of `tedious`, creating a new ' +
          '`Connection` instance will no longer establish a connection to the ' +
          'server automatically. Please use the new `connect` helper function or ' +
          'call the `.connect` method on the newly created `Connection` object to ' +
          'silence this message.';
        deprecate(message);
        this.connect();
      }
    });
  }

  connect(connectListener?: (err?: Error) => void) {
    if (this.state !== this.STATE.INITIALIZED) {
      throw new ConnectionError('`.connect` can not be called on a Connection in `' + this.state.name + '` state.');
    }

    if (connectListener) {
      const onConnect = (err?: Error) => {
        this.removeListener('error', onError);
        connectListener(err);
      };

      const onError = (err: Error) => {
        this.removeListener('connect', onConnect);
        connectListener(err);
      };

      this.once('connect', onConnect);
      this.once('error', onError);
    }

    this.transitionTo(this.STATE.CONNECTING);
  }

  /**
   * The server has reported that the charset has changed.
   */
  on(event: 'charsetChange', listener: (charset: string) => void): this

  /**
   * The attempt to connect and validate has completed.
   */
  on(
    event: 'connect',
    /**
     * @param err If successfully connected, will be falsey. If there was a
     *   problem (with either connecting or validation), will be an [[Error]] object.
     */
    listener: (err: Error | undefined) => void
  ): this

  /**
   * The server has reported that the active database has changed.
   * This may be as a result of a successful login, or a `use` statement.
   */
  on(event: 'databaseChange', listener: (databaseName: string) => void): this

  /**
   * A debug message is available. It may be logged or ignored.
   */
  on(event: 'debug', listener: (messageText: string) => void): this

  /**
   * Internal error occurs.
   */
  on(event: 'error', listener: (err: Error) => void): this

  /**
   * The server has issued an error message.
   */
  on(event: 'errorMessage', listener: (message: import('./token/token').ErrorMessageToken) => void): this

  /**
   * The connection has ended.
   *
   * This may be as a result of the client calling [[close]], the server
   * closing the connection, or a network error.
   */
  on(event: 'end', listener: () => void): this

  /**
   * The server has issued an information message.
   */
  on(event: 'infoMessage', listener: (message: import('./token/token').InfoMessageToken) => void): this

  /**
   * The server has reported that the language has changed.
   */
  on(event: 'languageChange', listener: (languageName: string) => void): this

  /**
   * A secure connection has been established.
   */
  on(event: 'secure', listener: (cleartext: import('tls').TLSSocket) => void): this

  on(event: string | symbol, listener: (...args: any[]) => void) {
    return super.on(event, listener);
  }

  /**
   * @private
   */
  emit(event: 'charsetChange', charset: string): boolean
  /**
   * @private
   */
  emit(event: 'connect', error?: Error): boolean
  /**
   * @private
   */
  emit(event: 'databaseChange', databaseName: string): boolean
  /**
   * @private
   */
  emit(event: 'debug', messageText: string): boolean
  /**
   * @private
   */
  emit(event: 'error', error: Error): boolean
  /**
   * @private
   */
  emit(event: 'errorMessage', message: import('./token/token').ErrorMessageToken): boolean
  /**
   * @private
   */
  emit(event: 'end'): boolean
  /**
   * @private
   */
  emit(event: 'infoMessage', message: import('./token/token').InfoMessageToken): boolean
  /**
   * @private
   */
  emit(event: 'languageChange', languageName: string): boolean
  /**
   * @private
   */
  emit(event: 'secure', cleartext: import('tls').TLSSocket): boolean
  /**
   * @private
   */
  emit(event: 'rerouting'): boolean
  /**
   * @private
   */
  emit(event: 'resetConnection'): boolean
  /**
   * @private
   */
  emit(event: 'retry'): boolean
  /**
   * @private
   */
  emit(event: 'rollbackTransaction'): boolean
  /**
   * @private
   */
  emit(event: 'sspichallenge', token: import('./token/token').SSPIToken): boolean
  emit(event: string | symbol, ...args: any[]) {
    return super.emit(event, ...args);
  }

  /**
   * Closes the connection to the database.
   *
   * The [[Event_end]] will be emitted once the connection has been closed.
   */
  close() {
    this.transitionTo(this.STATE.FINAL);
  }

  /**
   * @private
   */
  initialiseConnection() {
    this.createConnectTimer();

    if (this.config.options.port) {
      return this.connectOnPort(this.config.options.port, this.config.options.multiSubnetFailover);
    } else {
      return new InstanceLookup().instanceLookup({
        server: this.config.server,
        instanceName: this.config.options.instanceName!,
        timeout: this.config.options.connectTimeout
      }, (message, port) => {
        if (this.state === this.STATE.FINAL) {
          return;
        }

        if (message) {
          this.emit('connect', ConnectionError(message, 'EINSTLOOKUP'));
        } else {
          this.connectOnPort(port!, this.config.options.multiSubnetFailover);
        }
      });
    }
  }

  /**
   * @private
   */
  cleanupConnection(cleanupType: typeof CLEANUP_TYPE[keyof typeof CLEANUP_TYPE]) {
    if (!this.closed) {
      this.clearConnectTimer();
      this.clearRequestTimer();
      this.clearRetryTimer();
      this.closeConnection();
      if (cleanupType === CLEANUP_TYPE.REDIRECT) {
        this.emit('rerouting');
      } else if (cleanupType !== CLEANUP_TYPE.RETRY) {
        process.nextTick(() => {
          this.emit('end');
        });
      }

      const request = this.request;
      if (request) {
        const err = RequestError('Connection closed before request completed.', 'ECLOSE');
        request.callback(err);
        this.request = undefined;
      }

      this.closed = true;
      this.loggedIn = false;
      this.loginError = undefined;
    }
  }

  /**
   * @private
   */
  createDebug() {
    const debug = new Debug(this.config.options.debug);
    debug.on('debug', (message) => {
      this.emit('debug', message);
    });
    return debug;
  }

  /**
   * @private
   */
  createTokenStreamParser() {
    const tokenStreamParser = new TokenStreamParser(this.debug, this.config.options);

    tokenStreamParser.on('infoMessage', (token) => {
      this.emit('infoMessage', token);
    });

    tokenStreamParser.on('sspichallenge', (token) => {
      if (token.ntlmpacket) {
        this.ntlmpacket = token.ntlmpacket;
        this.ntlmpacketBuffer = token.ntlmpacketBuffer;
      }

      this.emit('sspichallenge', token);
    });

    tokenStreamParser.on('errorMessage', (token) => {
      this.emit('errorMessage', token);
      if (this.loggedIn) {
        const request = this.request;
        if (request) {
          if (!request.canceled) {
            const error = new RequestError(token.message, 'EREQUEST');
            error.number = token.number;
            error.state = token.state;
            error.class = token.class;
            error.serverName = token.serverName;
            error.procName = token.procName;
            error.lineNumber = token.lineNumber;
            request.error = error;
          }
        }
      } else {
        const error = ConnectionError(token.message, 'ELOGIN');

        const isLoginErrorTransient = this.transientErrorLookup.isTransientError(token.number);
        if (isLoginErrorTransient && this.curTransientRetryCount !== this.config.options.maxRetriesOnTransientErrors) {
          error.isTransient = true;
        }

        this.loginError = error;
      }
    });

    tokenStreamParser.parser.on('error', (error) => {
      this.emit('error', error);
    });

    tokenStreamParser.on('databaseChange', (token) => {
      this.emit('databaseChange', token.newValue);
    });

    tokenStreamParser.on('languageChange', (token) => {
      this.emit('languageChange', token.newValue);
    });

    tokenStreamParser.on('charsetChange', (token) => {
      this.emit('charsetChange', token.newValue);
    });

    tokenStreamParser.on('fedAuthInfo', (token) => {
      this.dispatchEvent('fedAuthInfo', token);
    });

    tokenStreamParser.on('featureExtAck', (token) => {
      this.dispatchEvent('featureExtAck', token);
    });

    tokenStreamParser.on('loginack', (token) => {
      if (!token.tdsVersion) {
        // unsupported TDS version
        this.loginError = ConnectionError('Server responded with unknown TDS version.', 'ETDS');
        this.loggedIn = false;
        return;
      }

      if (!token.interface) {
        // unsupported interface
        this.loginError = ConnectionError('Server responded with unsupported interface.', 'EINTERFACENOTSUPP');
        this.loggedIn = false;
        return;
      }

      // use negotiated version
      this.config.options.tdsVersion = token.tdsVersion;
      this.loggedIn = true;
    });

    tokenStreamParser.on('routingChange', (token) => {
      this.routingData = token.newValue;
      this.dispatchEvent('routingChange');
    });

    tokenStreamParser.on('packetSizeChange', (token) => {
      this.messageIo.packetSize(token.newValue);
    });

    // A new top-level transaction was started. This is not fired
    // for nested transactions.
    tokenStreamParser.on('beginTransaction', (token) => {
      this.transactionDescriptors.push(token.newValue);
      this.inTransaction = true;
    });

    // A top-level transaction was committed. This is not fired
    // for nested transactions.
    tokenStreamParser.on('commitTransaction', () => {
      this.transactionDescriptors.length = 1;
      this.inTransaction = false;
    });

    // A top-level transaction was rolled back. This is not fired
    // for nested transactions. This is also fired if a batch
    // aborting error happened that caused a rollback.
    tokenStreamParser.on('rollbackTransaction', () => {
      this.transactionDescriptors.length = 1;
      // An outermost transaction was rolled back. Reset the transaction counter
      this.inTransaction = false;
      this.emit('rollbackTransaction');
    });

    tokenStreamParser.on('columnMetadata', (token) => {
      const request = this.request;
      if (request) {
        if (!request.canceled) {
          if (this.config.options.useColumnNames) {
            const columns: { [key: string]: ColumnMetadata } = {};

            for (let j = 0, len = token.columns.length; j < len; j++) {
              const col = token.columns[j];
              if (columns[col.colName] == null) {
                columns[col.colName] = col;
              }
            }

            request.emit('columnMetadata', columns);
          } else {
            request.emit('columnMetadata', token.columns);
          }
        }
      } else {
        this.emit('error', new Error("Received 'columnMetadata' when no sqlRequest is in progress"));
        this.close();
      }
    });

    tokenStreamParser.on('order', (token) => {
      const request = this.request;
      if (request) {
        if (!request.canceled) {
          request.emit('order', token.orderColumns);
        }
      } else {
        this.emit('error', new Error("Received 'order' when no sqlRequest is in progress"));
        this.close();
      }
    });

    tokenStreamParser.on('row', (token) => {
      const request = this.request as Request;
      if (request) {
        if (!request.canceled) {
          if (this.config.options.rowCollectionOnRequestCompletion) {
            request.rows!.push(token.columns);
          }
          if (this.config.options.rowCollectionOnDone) {
            request.rst!.push(token.columns);
          }
          if (!(this.state === this.STATE.SENT_ATTENTION && request.paused)) {
            request.emit('row', token.columns);
          }
        }
      } else {
        this.emit('error', new Error("Received 'row' when no sqlRequest is in progress"));
        this.close();
      }
    });

    tokenStreamParser.on('returnStatus', (token) => {
      const request = this.request;
      if (request) {
        if (!request.canceled) {
          // Keep value for passing in 'doneProc' event.
          this.procReturnStatusValue = token.value;
        }
      }
    });

    tokenStreamParser.on('returnValue', (token) => {
      const request = this.request;
      if (request) {
        if (!request.canceled) {
          request.emit('returnValue', token.paramName, token.value, token.metadata);
        }
      }
    });

    tokenStreamParser.on('doneProc', (token) => {
      const request = this.request as Request;
      if (request) {
        if (!request.canceled) {
          request.emit('doneProc', token.rowCount, token.more, this.procReturnStatusValue, request.rst);
          this.procReturnStatusValue = undefined;
          if (token.rowCount !== undefined) {
            request.rowCount! += token.rowCount;
          }
          if (this.config.options.rowCollectionOnDone) {
            request.rst = [];
          }
        }
      }
    });

    tokenStreamParser.on('doneInProc', (token) => {
      const request = this.request as Request;
      if (request) {
        if (!request.canceled) {
          request.emit('doneInProc', token.rowCount, token.more, request.rst);
          if (token.rowCount !== undefined) {
            request.rowCount! += token.rowCount;
          }
          if (this.config.options.rowCollectionOnDone) {
            request.rst = [];
          }
        }
      }
    });

    tokenStreamParser.on('done', (token) => {
      const request = this.request as Request;
      if (request) {
        if (token.attention) {
          this.dispatchEvent('attention');
        }

        if (request.canceled) {
          // If we received a `DONE` token with `DONE_ERROR`, but no previous `ERROR` token,
          // We assume this is the indication that an in-flight request was canceled.
          if (token.sqlError && !request.error) {
            this.clearCancelTimer();
            request.error = RequestError('Canceled.', 'ECANCEL');
          }
        } else {
          if (token.sqlError && !request.error) {
            // check if the DONE_ERROR flags was set, but an ERROR token was not sent.
            request.error = RequestError('An unknown error has occurred.', 'UNKNOWN');
          }
          request.emit('done', token.rowCount, token.more, request.rst);
          if (token.rowCount !== undefined) {
            request.rowCount! += token.rowCount;
          }
          if (this.config.options.rowCollectionOnDone) {
            request.rst = [];
          }
        }
      }
    });

    tokenStreamParser.on('endOfMessage', () => { // EOM pseudo token received
      this.dispatchEvent('endOfMessageMarkerReceived');
    });

    tokenStreamParser.on('resetConnection', () => {
      this.emit('resetConnection');
    });

    tokenStreamParser.on('drain', () => {
      // Bridge the release of backpressure from the token stream parser
      // transform to the packet stream transform.
      this.messageIo.resume();
    });

    return tokenStreamParser;
  }

  connectOnPort(port: number, multiSubnetFailover: boolean) {
    const connectOpts = {
      host: this.routingData ? this.routingData.server : this.config.server,
      port: this.routingData ? this.routingData.port : port,
      localAddress: this.config.options.localAddress
    };

    new Connector(connectOpts, multiSubnetFailover).execute((err, socket) => {
      if (err) {
        return this.socketError(err);
      }

      if (this.state === this.STATE.FINAL) {
        socket!.destroy();
        return;
      }

      socket!.on('error', (error) => { this.socketError(error); });
      socket!.on('close', () => { this.socketClose(); });
      socket!.on('end', () => { this.socketEnd(); });
      socket!.setKeepAlive(true, KEEP_ALIVE_INITIAL_DELAY);

      this.messageIo = new MessageIO(socket!, this.config.options.packetSize, this.debug);
      this.messageIo.on('data', (data) => { this.dispatchEvent('data', data); });
      this.messageIo.on('message', () => { this.dispatchEvent('message'); });
      this.messageIo.on('secure', (cleartext) => { this.emit('secure', cleartext); });
      this.messageIo.on('error', (error) => {
        this.socketError(error);
      });

      this.socket = socket;
      this.socketConnect();
    });
  }

  /**
   * @private
   */
  closeConnection() {
    if (this.socket) {
      this.socket.destroy();
    }
  }

  /**
   * @private
   */
  createConnectTimer() {
    this.connectTimer = setTimeout(() => {
      this.connectTimeout();
    }, this.config.options.connectTimeout);
  }

  /**
   * @private
   */
  createCancelTimer() {
    this.clearCancelTimer();
    const timeout = this.config.options.cancelTimeout;
    if (timeout > 0) {
      this.cancelTimer = setTimeout(() => {
        this.cancelTimeout();
      }, timeout);
    }
  }

  /**
   * @private
   */
  createRequestTimer() {
    this.clearRequestTimer(); // release old timer, just to be safe
    const request = this.request as Request;
    const timeout = (request.timeout !== undefined) ? request.timeout : this.config.options.requestTimeout;
    if (timeout) {
      this.requestTimer = setTimeout(() => {
        this.requestTimeout();
      }, timeout);
    }
  }

  /**
   * @private
   */
  createRetryTimer() {
    this.clearRetryTimer();
    this.retryTimer = setTimeout(() => {
      this.retryTimeout();
    }, this.config.options.connectionRetryInterval);
  }

  /**
   * @private
   */
  connectTimeout() {
    const message = `Failed to connect to ${this.config.server}${this.config.options.port ? `:${this.config.options.port}` : `\\${this.config.options.instanceName}`} in ${this.config.options.connectTimeout}ms`;
    this.debug.log(message);
    this.emit('connect', ConnectionError(message, 'ETIMEOUT'));
    this.connectTimer = undefined;
    this.dispatchEvent('connectTimeout');
  }

  /**
   * @private
   */
  cancelTimeout() {
    const message = `Failed to cancel request in ${this.config.options.cancelTimeout}ms`;
    this.debug.log(message);
    this.dispatchEvent('socketError', ConnectionError(message, 'ETIMEOUT'));
  }

  /**
   * @private
   */
  requestTimeout() {
    this.requestTimer = undefined;
    const request = this.request!;
    request.cancel();
    const timeout = (request.timeout !== undefined) ? request.timeout : this.config.options.requestTimeout;
    const message = 'Timeout: Request failed to complete in ' + timeout + 'ms';
    request.error = RequestError(message, 'ETIMEOUT');
  }

  /**
   * @private
   */
  retryTimeout() {
    this.retryTimer = undefined;
    this.emit('retry');
    this.transitionTo(this.STATE.CONNECTING);
  }

  /**
   * @private
   */
  clearConnectTimer() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
    }
  }

  /**
   * @private
   */
  clearCancelTimer() {
    if (this.cancelTimer) {
      clearTimeout(this.cancelTimer);
    }
  }

  /**
   * @private
   */
  clearRequestTimer() {
    if (this.requestTimer) {
      clearTimeout(this.requestTimer);
      this.requestTimer = undefined;
    }
  }

  /**
   * @private
   */
  clearRetryTimer() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  /**
   * @private
   */
  transitionTo(newState: State) {
    if (this.state === newState) {
      this.debug.log('State is already ' + newState.name);
      return;
    }

    if (this.state && this.state.exit) {
      this.state.exit.call(this, newState);
    }

    this.debug.log('State change: ' + (this.state ? this.state.name : 'undefined') + ' -> ' + newState.name);
    this.state = newState;

    if (this.state.enter) {
      this.state.enter.apply(this);
    }
  }

  /**
   * @private
   */
  getEventHandler<T extends keyof State['events']>(eventName: T): NonNullable<State['events'][T]> {
    const handler = this.state.events[eventName];

    if (!handler) {
      throw new Error(`No event '${eventName}' in state '${this.state.name}'`);
    }

    return handler!;
  }

  /**
   * @private
   */
  dispatchEvent<T extends keyof State['events']>(eventName: T, ...args: Parameters<NonNullable<State['events'][T]>>) {
    const handler = this.state.events[eventName] as Function | undefined;
    if (handler) {
      handler.apply(this, args);
    } else {
      this.emit('error', new Error(`No event '${eventName}' in state '${this.state.name}'`));
      this.close();
    }
  }

  /**
   * @private
   */
  socketError(error: Error) {
    if (this.state === this.STATE.CONNECTING || this.state === this.STATE.SENT_TLSSSLNEGOTIATION) {
      const message = `Failed to connect to ${this.config.server}:${this.config.options.port} - ${error.message}`;
      this.debug.log(message);
      this.emit('connect', ConnectionError(message, 'ESOCKET'));
    } else {
      const message = `Connection lost - ${error.message}`;
      this.debug.log(message);
      this.emit('error', ConnectionError(message, 'ESOCKET'));
    }
    this.dispatchEvent('socketError', error);
  }

  /**
   * @private
   */
  socketConnect() {
    this.closed = false;
    this.debug.log('connected to ' + this.config.server + ':' + this.config.options.port);
    this.dispatchEvent('socketConnect');
  }

  /**
   * @private
   */
  socketEnd() {
    this.debug.log('socket ended');
    if (this.state !== this.STATE.FINAL) {
      const error: ErrorWithCode = new Error('socket hang up');
      error.code = 'ECONNRESET';
      this.socketError(error);
    }
  }

  /**
   * @private
   */
  socketClose() {
    this.debug.log('connection to ' + this.config.server + ':' + this.config.options.port + ' closed');
    if (this.state === this.STATE.REROUTING) {
      this.debug.log('Rerouting to ' + this.routingData.server + ':' + this.routingData.port);
      this.dispatchEvent('reconnect');
    } else if (this.state === this.STATE.TRANSIENT_FAILURE_RETRY) {
      const server = this.routingData ? this.routingData.server : this.config.server;
      const port = this.routingData ? this.routingData.port : this.config.options.port;
      this.debug.log('Retry after transient failure connecting to ' + server + ':' + port);

      this.dispatchEvent('retry');
    } else {
      this.transitionTo(this.STATE.FINAL);
    }
  }

  /**
   * @private
   */
  sendPreLogin() {
    const payload = new PreloginPayload({
      encrypt: this.config.options.encrypt
    });
    this.messageIo.sendMessage(TYPE.PRELOGIN, payload.data);
    this.debug.payload(function() {
      return payload.toString('  ');
    });
  }

  /**
   * @private
   */
  emptyMessageBuffer() {
    this.messageBuffer = Buffer.alloc(0);
  }

  /**
   * @private
   */
  addToMessageBuffer(data: Buffer) {
    this.messageBuffer = Buffer.concat([this.messageBuffer, data]);
  }

  /**
   * @private
   */
  sendLogin7Packet() {
    const payload = new Login7Payload({
      tdsVersion: versions[this.config.options.tdsVersion],
      packetSize: this.config.options.packetSize,
      clientProgVer: 0,
      clientPid: process.pid,
      connectionId: 0,
      clientTimeZone: new Date().getTimezoneOffset(),
      clientLcid: 0x00000409
    });

    payload.columnEncryption = this.config.options.columnEncryptionSetting;

    const { authentication } = this.config;
    switch (authentication.type) {
      case 'azure-active-directory-password':
        payload.fedAuth = {
          type: 'ADAL',
          echo: this.fedAuthRequired,
          workflow: 'default'
        };
        break;

      case 'azure-active-directory-access-token':
        payload.fedAuth = {
          type: 'SECURITYTOKEN',
          echo: this.fedAuthRequired,
          fedAuthToken: authentication.options.token
        };
        break;

      case 'azure-active-directory-msi-vm':
      case 'azure-active-directory-msi-app-service':
      case 'azure-active-directory-service-principal-secret':
        payload.fedAuth = {
          type: 'ADAL',
          echo: this.fedAuthRequired,
          workflow: 'integrated'
        };
        break;

      case 'ntlm':
        payload.sspi = createNTLMRequest({ domain: authentication.options.domain });
        break;

      default:
        payload.userName = authentication.options.userName;
        payload.password = authentication.options.password;
    }

    payload.hostname = this.config.options.workstationId || os.hostname();
    payload.serverName = this.routingData ? this.routingData.server : this.config.server;
    payload.appName = this.config.options.appName || 'Tedious';
    payload.libraryName = libraryName;
    payload.language = this.config.options.language;
    payload.database = this.config.options.database;
    payload.clientId = Buffer.from([1, 2, 3, 4, 5, 6]);

    payload.readOnlyIntent = this.config.options.readOnlyIntent;
    payload.initDbFatal = !this.config.options.fallbackToDefaultDb;

    this.routingData = undefined;
    this.messageIo.sendMessage(TYPE.LOGIN7, payload.toBuffer());

    this.debug.payload(function() {
      return payload.toString('  ');
    });
  }

  /**
   * @private
   */
  sendFedAuthTokenMessage(token: string) {
    const accessTokenLen = Buffer.byteLength(token, 'ucs2');
    const data = Buffer.alloc(8 + accessTokenLen);
    let offset = 0;
    offset = data.writeUInt32LE(accessTokenLen + 4, offset);
    offset = data.writeUInt32LE(accessTokenLen, offset);
    data.write(token, offset, 'ucs2');
    this.messageIo.sendMessage(TYPE.FEDAUTH_TOKEN, data);
    // sent the fedAuth token message, the rest is similar to standard login 7
    this.transitionTo(this.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
  }

  /**
   * Returns false to apply backpressure.
   *
   * @private
   */
  sendDataToTokenStreamParser(data: Buffer) {
    return this.tokenStreamParser.addBuffer(data);
  }

  /**
   * This is an internal method that is called from [[Request.pause]].
   * It has to check whether the passed Request object represents the currently
   * active request, because the application might have called [[Request.pause]]
   * on an old inactive Request object.
   *
   * @private
   */
  pauseRequest(request: Request | BulkLoad) {
    if (this.isRequestActive(request)) {
      this.tokenStreamParser.pause();
    }
  }

  /**
   * This is an internal method that is called from [[Request.resume]].
   *
   * @private
   */
  resumeRequest(request: Request | BulkLoad) {
    if (this.isRequestActive(request)) {
      this.tokenStreamParser.resume();
    }
  }

  /**
   * Returns true if the passed request is the currently active request of the connection.
   *
   * @private
   */
  isRequestActive(request: Request | BulkLoad) {
    return request === this.request && this.state === this.STATE.SENT_CLIENT_REQUEST;
  }

  /**
   * @private
   */
  sendInitialSql() {
    const payload = new SqlBatchPayload(this.getInitialSql(), this.currentTransactionDescriptor(), this.config.options);

    const message = new Message({ type: TYPE.SQL_BATCH });
    this.messageIo.outgoingMessageStream.write(message);
    Readable.from(payload).pipe(message);
  }

  /**
   * @private
   */
  getInitialSql() {
    const options = [];

    if (this.config.options.enableAnsiNull === true) {
      options.push('set ansi_nulls on');
    } else if (this.config.options.enableAnsiNull === false) {
      options.push('set ansi_nulls off');
    }

    if (this.config.options.enableAnsiNullDefault === true) {
      options.push('set ansi_null_dflt_on on');
    } else if (this.config.options.enableAnsiNullDefault === false) {
      options.push('set ansi_null_dflt_on off');
    }

    if (this.config.options.enableAnsiPadding === true) {
      options.push('set ansi_padding on');
    } else if (this.config.options.enableAnsiPadding === false) {
      options.push('set ansi_padding off');
    }

    if (this.config.options.enableAnsiWarnings === true) {
      options.push('set ansi_warnings on');
    } else if (this.config.options.enableAnsiWarnings === false) {
      options.push('set ansi_warnings off');
    }

    if (this.config.options.enableArithAbort === true) {
      options.push('set arithabort on');
    } else if (this.config.options.enableArithAbort === false) {
      options.push('set arithabort off');
    }

    if (this.config.options.enableConcatNullYieldsNull === true) {
      options.push('set concat_null_yields_null on');
    } else if (this.config.options.enableConcatNullYieldsNull === false) {
      options.push('set concat_null_yields_null off');
    }

    if (this.config.options.enableCursorCloseOnCommit === true) {
      options.push('set cursor_close_on_commit on');
    } else if (this.config.options.enableCursorCloseOnCommit === false) {
      options.push('set cursor_close_on_commit off');
    }

    if (this.config.options.datefirst !== null) {
      options.push(`set datefirst ${this.config.options.datefirst}`);
    }

    if (this.config.options.dateFormat !== null) {
      options.push(`set dateformat ${this.config.options.dateFormat}`);
    }

    if (this.config.options.enableImplicitTransactions === true) {
      options.push('set implicit_transactions on');
    } else if (this.config.options.enableImplicitTransactions === false) {
      options.push('set implicit_transactions off');
    }

    if (this.config.options.language !== null) {
      options.push(`set language ${this.config.options.language}`);
    }

    if (this.config.options.enableNumericRoundabort === true) {
      options.push('set numeric_roundabort on');
    } else if (this.config.options.enableNumericRoundabort === false) {
      options.push('set numeric_roundabort off');
    }

    if (this.config.options.enableQuotedIdentifier === true) {
      options.push('set quoted_identifier on');
    } else if (this.config.options.enableQuotedIdentifier === false) {
      options.push('set quoted_identifier off');
    }

    if (this.config.options.textsize !== null) {
      options.push(`set textsize ${this.config.options.textsize}`);
    }

    if (this.config.options.connectionIsolationLevel !== null) {
      options.push(`set transaction isolation level ${this.getIsolationLevelText(this.config.options.connectionIsolationLevel)}`);
    }

    if (this.config.options.abortTransactionOnError === true) {
      options.push('set xact_abort on');
    } else if (this.config.options.abortTransactionOnError === false) {
      options.push('set xact_abort off');
    }

    return options.join('\n');
  }

  /**
   * @private
   */
  processedInitialSql() {
    this.clearConnectTimer();
    this.emit('connect');
  }

  /**
   * Execute the SQL batch represented by [[Request]].
   * There is no param support, and unlike [[Request.execSql]],
   * it is not likely that SQL Server will reuse the execution plan it generates for the SQL.
   *
   * In almost all cases, [[Request.execSql]] will be a better choice.
   *
   * @param request A [[Request]] object representing the request.
   */
  execSqlBatch(request: Request) {
    this.makeRequest(request, TYPE.SQL_BATCH, new SqlBatchPayload(request.sqlTextOrProcedure!, this.currentTransactionDescriptor(), this.config.options));
  }

<<<<<<< HEAD
  _execSql(request: Request) {
=======
  /**
   *  Execute the SQL represented by [[Request]].
   *
   * As `sp_executesql` is used to execute the SQL, if the same SQL is executed multiples times
   * using this function, the SQL Server query optimizer is likely to reuse the execution plan it generates
   * for the first execution. This may also result in SQL server treating the request like a stored procedure
   * which can result in the [[Event_doneInProc]] or [[Event_doneProc]] events being emitted instead of the
   * [[Event_done]] event you might expect. Using [[execSqlBatch]] will prevent this from occurring but may have a negative performance impact.
   *
   * Beware of the way that scoping rules apply, and how they may [affect local temp tables](http://weblogs.sqlteam.com/mladenp/archive/2006/11/03/17197.aspx)
   * If you're running in to scoping issues, then [[execSqlBatch]] may be a better choice.
   * See also [issue #24](https://github.com/pekim/tedious/issues/24)
   *
   * @param request A [[Request]] object representing the request.
   */
  execSql(request: Request) {
>>>>>>> origin-master
    request.transformIntoExecuteSqlRpc();

    const error = request.error;
    if (error != null) {
      process.nextTick(() => {
        this.debug.log(error.message);
        request.callback(error);
      });
      return;
    }

    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  execSql(request: Request) {
    request.shouldHonorAE = shouldHonorAE(request.statementColumnEncryptionSetting, this.config.options.columnEncryptionSetting);
    if (request.shouldHonorAE && request.cryptoMetadataLoaded === false && (request.parameters && request.parameters.length > 0)) {
      getParameterEncryptionMetadata(this, request, (error?: Error) => {
        if (error != null) {
          process.nextTick(() => {
            this.debug.log(error.message);
            request.callback(error);
          });
          return;
        }
        this._execSql(request);
      });
    } else {
      this._execSql(request);
    }
  }

  /**
   * Creates a new BulkLoad instance.
   *
   * @param table The name of the table to bulk-insert into.
   * @param options A set of bulk load options.
   */
  newBulkLoad(table: string, callback: BulkLoadCallback): BulkLoad
  newBulkLoad(table: string, options: BulkLoadOptions, callback: BulkLoadCallback): BulkLoad
  newBulkLoad(table: string, callbackOrOptions: BulkLoadOptions | BulkLoadCallback, callback?: BulkLoadCallback) {
    let options: BulkLoadOptions;

    if (callback === undefined) {
      callback = callbackOrOptions as BulkLoadCallback;
      options = {};
    } else {
      options = callbackOrOptions as BulkLoadOptions;
    }

    if (typeof options !== 'object') {
      throw new TypeError('"options" argument must be an object');
    }
    return new BulkLoad(table, this.config.options, options, callback);
  }

  /**
   * Execute the SQL batch represented by [[Request]] .
   * There is no param support, and unlike [[execSql]],
   * it is not likely that SQL Server will reuse the execution plan it generates for the SQL.
   *
   * In almost all cases, [[execSql]] will be a better choice.
   *
   * @param bulkLoad A previously prepared [[Request]] .
   */
  execBulkLoad(bulkLoad: BulkLoad) {
    bulkLoad.executionStarted = true;
    const request = new Request(bulkLoad.getBulkInsertSql(), (error: (Error & { code?: string }) | null | undefined) => {
      if (error) {
        if (error.code === 'UNKNOWN') {
          error.message += ' This is likely because the schema of the BulkLoad does not match the schema of the table you are attempting to insert into.';
        }
        bulkLoad.error = error;
        bulkLoad.callback(error);
        return;
      }

      this.makeRequest(bulkLoad, TYPE.BULK_LOAD);
    });

    bulkLoad.once('cancel', () => {
      request.cancel();
    });

    this.execSqlBatch(request);
  }

  /**
   * Prepare the SQL represented by the request.
   *
   * The request can then be used in subsequent calls to
   * [[execute]] and [[unprepare]]
   *
   * @param request A [[Request]] object representing the request.
   *   Parameters only require a name and type. Parameter values are ignored.
   */
  prepare(request: Request) {
    request.transformIntoPrepareRpc();
    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  /**
   * Release the SQL Server resources associated with a previously prepared request.
   *
   * @param request A [[Request]] object representing the request.
   *   Parameters only require a name and type.
   *   Parameter values are ignored.
   */
  unprepare(request: Request) {
    request.transformIntoUnprepareRpc();
    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  /**
   * Execute previously prepared SQL, using the supplied parameters.
   *
   * @param request A previously prepared [[Request]].
   * @param parameters  An object whose names correspond to the names of
   *   parameters that were added to the [[Request]] before it was prepared.
   *   The object's values are passed as the parameters' values when the
   *   request is executed.
   */
  execute(request: Request, parameters: { [key: string]: unknown }) {
    request.transformIntoExecuteRpc(parameters);

    const error = request.error;
    if (error != null) {
      process.nextTick(() => {
        this.debug.log(error.message);
        request.callback(error);
      });

      return;
    }

    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  /**
   * Call a stored procedure represented by [[Request]].
   *
   * @param request A [[Request]] object representing the request.
   */
  callProcedure(request: Request) {
    request.validateParameters();

    const error = request.error;
    if (error != null) {
      process.nextTick(() => {
        this.debug.log(error.message);
        request.callback(error);
      });
      return;
    }

    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  /**
   * Start a transaction.
   *
   * @param callback
   * @param name A string representing a name to associate with the transaction.
   *   Optional, and defaults to an empty string. Required when `isolationLevel`
   *   is present.
   * @param isolationLevel The isolation level that the transaction is to be run with.
   *
   *   The isolation levels are available from `require('tedious').ISOLATION_LEVEL`.
   *   * `READ_UNCOMMITTED`
   *   * `READ_COMMITTED`
   *   * `REPEATABLE_READ`
   *   * `SERIALIZABLE`
   *   * `SNAPSHOT`
   *
   *   Optional, and defaults to the Connection's isolation level.
   */
  beginTransaction(callback: BeginTransactionCallback, name = '', isolationLevel = this.config.options.isolationLevel) {
    assertValidIsolationLevel(isolationLevel, 'isolationLevel');

    const transaction = new Transaction(name, isolationLevel);

    if (this.config.options.tdsVersion < '7_2') {
      return this.execSqlBatch(new Request('SET TRANSACTION ISOLATION LEVEL ' + (transaction.isolationLevelToTSQL()) + ';BEGIN TRAN ' + transaction.name, (err) => {
        this.transactionDepth++;
        if (this.transactionDepth === 1) {
          this.inTransaction = true;
        }
        callback(err);
      }));
    }

    const request = new Request(undefined, (err) => {
      return callback(err, this.currentTransactionDescriptor());
    });
    return this.makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.beginPayload(this.currentTransactionDescriptor()));
  }

  /**
   * Commit a transaction.
   *
   * There should be an active transaction - that is, [[beginTransaction]]
   * should have been previously called.
   *
   * @param callback
   * @param name A string representing a name to associate with the transaction.
   *   Optional, and defaults to an empty string. Required when `isolationLevel`is present.
   */
  commitTransaction(callback: CommitTransactionCallback, name = '') {
    const transaction = new Transaction(name);
    if (this.config.options.tdsVersion < '7_2') {
      return this.execSqlBatch(new Request('COMMIT TRAN ' + transaction.name, (err) => {
        this.transactionDepth--;
        if (this.transactionDepth === 0) {
          this.inTransaction = false;
        }

        callback(err);
      }));
    }
    const request = new Request(undefined, callback);
    return this.makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.commitPayload(this.currentTransactionDescriptor()));
  }

  /**
   * Rollback a transaction.
   *
   * There should be an active transaction - that is, [[beginTransaction]]
   * should have been previously called.
   *
   * @param callback
   * @param name A string representing a name to associate with the transaction.
   *   Optional, and defaults to an empty string.
   *   Required when `isolationLevel` is present.
   */
  rollbackTransaction(callback: RollbackTransactionCallback, name = '') {
    const transaction = new Transaction(name);
    if (this.config.options.tdsVersion < '7_2') {
      return this.execSqlBatch(new Request('ROLLBACK TRAN ' + transaction.name, (err) => {
        this.transactionDepth--;
        if (this.transactionDepth === 0) {
          this.inTransaction = false;
        }
        callback(err);
      }));
    }
    const request = new Request(undefined, callback);
    return this.makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.rollbackPayload(this.currentTransactionDescriptor()));
  }

  /**
   * Set a savepoint within a transaction.
   *
   * There should be an active transaction - that is, [[beginTransaction]]
   * should have been previously called.
   *
   * @param callback
   * @param name A string representing a name to associate with the transaction.\
   *   Optional, and defaults to an empty string.
   *   Required when `isolationLevel` is present.
   */
  saveTransaction(callback: SaveTransactionCallback, name: string) {
    const transaction = new Transaction(name);
    if (this.config.options.tdsVersion < '7_2') {
      return this.execSqlBatch(new Request('SAVE TRAN ' + transaction.name, (err) => {
        this.transactionDepth++;
        callback(err);
      }));
    }
    const request = new Request(undefined, callback);
    return this.makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.savePayload(this.currentTransactionDescriptor()));
  }

  /**
   * Run the given callback after starting a transaction, and commit or
   * rollback the transaction afterwards.
   *
   * This is a helper that employs [[beginTransaction]], [[commitTransaction]],
   * [[rollbackTransaction]], and [[saveTransaction]] to greatly simplify the
   * use of database transactions and automatically handle transaction nesting.
   *
   * @param cb
   * @param isolationLevel
   *   The isolation level that the transaction is to be run with.
   *
   *   The isolation levels are available from `require('tedious').ISOLATION_LEVEL`.
   *   * `READ_UNCOMMITTED`
   *   * `READ_COMMITTED`
   *   * `REPEATABLE_READ`
   *   * `SERIALIZABLE`
   *   * `SNAPSHOT`
   *
   *   Optional, and defaults to the Connection's isolation level.
   */
  transaction(cb: (err: Error | null | undefined, txDone?: <T extends TransactionDoneCallback>(err: Error | null | undefined, done: T, ...args: CallbackParameters<T>) => void) => void, isolationLevel?: typeof ISOLATION_LEVEL[keyof typeof ISOLATION_LEVEL]) {
    if (typeof cb !== 'function') {
      throw new TypeError('`cb` must be a function');
    }

    const useSavepoint = this.inTransaction;
    const name = '_tedious_' + (crypto.randomBytes(10).toString('hex'));
    const txDone: <T extends TransactionDoneCallback>(err: Error | null | undefined, done: T, ...args: CallbackParameters<T>) => void = (err, done, ...args) => {
      if (err) {
        if (this.inTransaction && this.state === this.STATE.LOGGED_IN) {
          this.rollbackTransaction((txErr) => {
            done(txErr || err, ...args);
          }, name);
        } else {
          done(err, ...args);
        }
      } else if (useSavepoint) {
        if (this.config.options.tdsVersion < '7_2') {
          this.transactionDepth--;
        }
        done(null, ...args);
      } else {
        this.commitTransaction((txErr) => {
          done(txErr, ...args);
        }, name);
      }
    };

    if (useSavepoint) {
      return this.saveTransaction((err) => {
        if (err) {
          return cb(err);
        }

        if (isolationLevel) {
          return this.execSqlBatch(new Request('SET transaction isolation level ' + this.getIsolationLevelText(isolationLevel), (err) => {
            return cb(err, txDone);
          }));
        } else {
          return cb(null, txDone);
        }
      }, name);
    } else {
      return this.beginTransaction((err) => {
        if (err) {
          return cb(err);
        }

        return cb(null, txDone);
      }, name, isolationLevel);
    }
  }

  /**
   * @private
   */
  makeRequest(request: BulkLoad, packetType: number): void
  makeRequest(request: Request, packetType: number, payload: Iterable<Buffer> & { toString: (indent?: string) => string }): void
  makeRequest(request: Request | BulkLoad, packetType: number, payload?: Iterable<Buffer> & { toString: (indent?: string) => string }) {
    if (this.state !== this.STATE.LOGGED_IN) {
      const message = 'Requests can only be made in the ' + this.STATE.LOGGED_IN.name + ' state, not the ' + this.state.name + ' state';
      this.debug.log(message);
      request.callback(RequestError(message, 'EINVALIDSTATE'));
    } else if (request.canceled) {
      process.nextTick(() => {
        request.callback(RequestError('Canceled.', 'ECANCEL'));
      });
    } else {
      if (packetType === TYPE.SQL_BATCH) {
        this.isSqlBatch = true;
      } else {
        this.isSqlBatch = false;
      }

      this.request = request;
      request.connection! = this;
      request.rowCount! = 0;
      request.rows! = [];
      request.rst! = [];

      let message: Message;

      request.once('cancel', () => {
        // There's three ways to handle request cancelation:
        if (!this.isRequestActive(request)) {
          // Cancel was called on a request that is no longer active on this connection
          return;
        } else if (message.writable) {
          // - if the message is still writable, we'll set the ignore bit
          //   and end the message.
          message.ignore = true;
          message.end();
        } else {
          // - but if the message has been ended (and thus has been fully sent off),
          //   we need to send an `ATTENTION` message to the server
          this.messageIo.sendMessage(TYPE.ATTENTION);
          this.transitionTo(this.STATE.SENT_ATTENTION);
        }

        this.clearRequestTimer();
        this.createCancelTimer();
      });

      if (request instanceof BulkLoad) {
        message = request.getMessageStream();

        // If the bulkload was not put into streaming mode by the user,
        // we end the rowToPacketTransform here for them.
        //
        // If it was put into streaming mode, it's the user's responsibility
        // to end the stream.
        if (!request.streamingMode) {
          request.rowToPacketTransform.end();
        }
        this.messageIo.outgoingMessageStream.write(message);
        this.transitionTo(this.STATE.SENT_CLIENT_REQUEST);
      } else {
        this.createRequestTimer();

        message = new Message({ type: packetType, resetConnection: this.resetConnectionOnNextRequest });
        this.messageIo.outgoingMessageStream.write(message);
        this.transitionTo(this.STATE.SENT_CLIENT_REQUEST);

        message.once('finish', () => {
          this.resetConnectionOnNextRequest = false;
          this.debug.payload(function() {
            return payload!.toString('  ');
          });

          if (request.paused) { // Request.pause() has been called before the request was started
            this.pauseRequest(request);
          }
        });

        Readable.from(payload!).pipe(message);
      }
    }
  }

  /**
   * Cancel currently executed request.
   */
  cancel() {
    if (!this.request) {
      return false;
    }

    if (this.request.canceled) {
      return false;
    }

    this.request.cancel();
    return true;
  }

  /**
   * Reset the connection to its initial state.
   * Can be useful for connection pool implementations.
   *
   * @param callback
   */
  reset(callback: ResetCallback) {
    const request = new Request(this.getInitialSql(), (err) => {
      if (this.config.options.tdsVersion < '7_2') {
        this.inTransaction = false;
      }
      callback(err);
    });
    this.resetConnectionOnNextRequest = true;
    this.execSqlBatch(request);
  }

  /**
   * @private
   */
  currentTransactionDescriptor() {
    return this.transactionDescriptors[this.transactionDescriptors.length - 1];
  }

  /**
   * @private
   */
  getIsolationLevelText(isolationLevel: typeof ISOLATION_LEVEL[keyof typeof ISOLATION_LEVEL]) {
    switch (isolationLevel) {
      case ISOLATION_LEVEL.READ_UNCOMMITTED:
        return 'read uncommitted';
      case ISOLATION_LEVEL.REPEATABLE_READ:
        return 'repeatable read';
      case ISOLATION_LEVEL.SERIALIZABLE:
        return 'serializable';
      case ISOLATION_LEVEL.SNAPSHOT:
        return 'snapshot';
      default:
        return 'read committed';
    }
  }
}

export default Connection;
module.exports = Connection;

Connection.prototype.STATE = {
  INITIALIZED: {
    name: 'Initialized',
    events: {}
  },
  CONNECTING: {
    name: 'Connecting',
    enter: function() {
      this.initialiseConnection();
    },
    events: {
      socketError: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      socketConnect: function() {
        this.sendPreLogin();
        this.transitionTo(this.STATE.SENT_PRELOGIN);
      }
    }
  },
  SENT_PRELOGIN: {
    name: 'SentPrelogin',
    enter: function() {
      this.emptyMessageBuffer();
    },
    events: {
      socketError: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        this.addToMessageBuffer(data);
      },
      message: function() {
        this.tokenStreamParser.addEndOfMessageMarker();
      },
      endOfMessageMarkerReceived: function() {
        const preloginPayload = new PreloginPayload(this.messageBuffer);
        this.debug.payload(function() {
          return preloginPayload.toString('  ');
        });

        if (preloginPayload.fedAuthRequired === 1) {
          this.fedAuthRequired = true;
        }

        if (preloginPayload.encryptionString === 'ON' || preloginPayload.encryptionString === 'REQ') {
          if (!this.config.options.encrypt) {
            this.emit('connect', ConnectionError("Server requires encryption, set 'encrypt' config option to true.", 'EENCRYPT'));
            return this.close();
          }

          this.messageIo.startTls(this.secureContext, this.routingData?.server ?? this.config.server, this.config.options.trustServerCertificate);
          this.transitionTo(this.STATE.SENT_TLSSSLNEGOTIATION);
        } else {
          this.sendLogin7Packet();

          const { authentication } = this.config;
          if (authentication.type === 'ntlm') {
            this.transitionTo(this.STATE.SENT_LOGIN7_WITH_NTLM);
          } else {
            this.transitionTo(this.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
          }
        }
      }
    }
  },
  REROUTING: {
    name: 'ReRouting',
    enter: function() {
      this.cleanupConnection(CLEANUP_TYPE.REDIRECT);
    },
    events: {
      message: function() {
      },
      socketError: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      reconnect: function() {
        this.transitionTo(this.STATE.CONNECTING);
      }
    }
  },
  TRANSIENT_FAILURE_RETRY: {
    name: 'TRANSIENT_FAILURE_RETRY',
    enter: function() {
      this.curTransientRetryCount++;
      this.cleanupConnection(CLEANUP_TYPE.RETRY);
    },
    events: {
      message: function() {
      },
      socketError: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      retry: function() {
        this.createRetryTimer();
      }
    }
  },
  SENT_TLSSSLNEGOTIATION: {
    name: 'SentTLSSSLNegotiation',
    events: {
      socketError: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        this.messageIo.tlsHandshakeData(data);
      },
      message: function() {
        this.tokenStreamParser.addEndOfMessageMarker();
      },
      endOfMessageMarkerReceived: function() {
        if (this.messageIo.tlsNegotiationComplete) {
          this.sendLogin7Packet();

          const { authentication } = this.config;

          if (authentication.type === 'azure-active-directory-password' || authentication.type === 'azure-active-directory-msi-vm' || authentication.type === 'azure-active-directory-msi-app-service' || authentication.type === 'azure-active-directory-service-principal-secret') {
            this.transitionTo(this.STATE.SENT_LOGIN7_WITH_FEDAUTH);
          } else if (authentication.type === 'ntlm') {
            this.transitionTo(this.STATE.SENT_LOGIN7_WITH_NTLM);
          } else {
            this.transitionTo(this.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
          }
        }
      }
    }
  },
  SENT_LOGIN7_WITH_STANDARD_LOGIN: {
    name: 'SentLogin7WithStandardLogin',
    events: {
      socketError: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        this.sendDataToTokenStreamParser(data);
      },
      routingChange: function() {
        this.transitionTo(this.STATE.REROUTING);
      },
      featureExtAck: function(token) {
        if (token.columnEncryption) {
          this.config.options.serverSupportsColumnEncryption = true;
          return;
        }
        const { authentication } = this.config;
        if (authentication.type === 'azure-active-directory-password' || authentication.type === 'azure-active-directory-access-token' || authentication.type === 'azure-active-directory-msi-vm' || authentication.type === 'azure-active-directory-msi-app-service' || authentication.type === 'azure-active-directory-service-principal-secret') {
          if (token.fedAuth === undefined) {
            this.loginError = ConnectionError('Did not receive Active Directory authentication acknowledgement');
            this.loggedIn = false;
          } else if (token.fedAuth.length !== 0) {
            this.loginError = ConnectionError(`Active Directory authentication acknowledgment for ${authentication.type} authentication method includes extra data`);
            this.loggedIn = false;
          }
        } else if (token.fedAuth === undefined) {
          this.loginError = ConnectionError('Received acknowledgement for unknown feature');
          this.loggedIn = false;
        } else {
          this.loginError = ConnectionError('Did not request Active Directory authentication, but received the acknowledgment');
          this.loggedIn = false;
        }
      },
      message: function() {
        this.tokenStreamParser.addEndOfMessageMarker();
      },
      endOfMessageMarkerReceived: function() {
        if (this.loggedIn) {
          this.transitionTo(this.STATE.LOGGED_IN_SENDING_INITIAL_SQL);
        } else if (this.loginError) {
          if (this.loginError.isTransient) {
            this.debug.log('Initiating retry on transient error');
            this.transitionTo(this.STATE.TRANSIENT_FAILURE_RETRY);
          } else {
            this.emit('connect', this.loginError);
            this.transitionTo(this.STATE.FINAL);
          }
        } else {
          this.emit('connect', ConnectionError('Login failed.', 'ELOGIN'));
          this.transitionTo(this.STATE.FINAL);
        }
      }
    }
  },
  SENT_LOGIN7_WITH_NTLM: {
    name: 'SentLogin7WithNTLMLogin',
    events: {
      socketError: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        this.sendDataToTokenStreamParser(data);
      },
      message: function() {
        this.tokenStreamParser.addEndOfMessageMarker();
      },
      endOfMessageMarkerReceived: function() {
        if (this.ntlmpacket) {
          const authentication = this.config.authentication as NtlmAuthentication;

          const payload = new NTLMResponsePayload({
            domain: authentication.options.domain,
            userName: authentication.options.userName,
            password: authentication.options.password,
            ntlmpacket: this.ntlmpacket
          });

          this.messageIo.sendMessage(TYPE.NTLMAUTH_PKT, payload.data);
          this.debug.payload(function() {
            return payload.toString('  ');
          });

          this.ntlmpacket = undefined;
        } else if (this.loggedIn) {
          this.transitionTo(this.STATE.LOGGED_IN_SENDING_INITIAL_SQL);
        } else if (this.loginError) {
          if (this.loginError.isTransient) {
            this.debug.log('Initiating retry on transient error');
            this.transitionTo(this.STATE.TRANSIENT_FAILURE_RETRY);
          } else {
            this.emit('connect', this.loginError);
            this.transitionTo(this.STATE.FINAL);
          }
        } else {
          this.emit('connect', ConnectionError('Login failed.', 'ELOGIN'));
          this.transitionTo(this.STATE.FINAL);
        }
      }
    }
  },
  SENT_LOGIN7_WITH_FEDAUTH: {
    name: 'SentLogin7Withfedauth',
    events: {
      socketError: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        this.sendDataToTokenStreamParser(data);
      },
      routingChange: function() {
        this.transitionTo(this.STATE.REROUTING);
      },
      fedAuthInfo: function(token) {
        this.fedAuthInfoToken = token;
      },
      message: function() {
        this.tokenStreamParser.addEndOfMessageMarker();
      },
      endOfMessageMarkerReceived: function() {
        const fedAuthInfoToken = this.fedAuthInfoToken;

        if (fedAuthInfoToken && fedAuthInfoToken.stsurl && fedAuthInfoToken.spn) {
          const authentication = this.config.authentication as AzureActiveDirectoryPasswordAuthentication | AzureActiveDirectoryMsiVmAuthentication | AzureActiveDirectoryMsiAppServiceAuthentication | AzureActiveDirectoryServicePrincipalSecret;

          const getToken = (callback: (error: Error | null, token?: string) => void) => {
            const getTokenFromCredentials = (err: Error | undefined, credentials?: UserTokenCredentials | MSIAppServiceTokenCredentials | MSIVmTokenCredentials | ApplicationTokenCredentials) => {
              if (err) {
                return callback(err);
              }

              credentials!.getToken().then((tokenResponse) => {
                callback(null, tokenResponse.accessToken);
              }, callback);
            };

            if (authentication.type === 'azure-active-directory-password') {
              loginWithUsernamePassword(authentication.options.userName, authentication.options.password, {
                clientId: '7f98cb04-cd1e-40df-9140-3bf7e2cea4db',
                tokenAudience: fedAuthInfoToken.spn
              }, getTokenFromCredentials);
            } else if (authentication.type === 'azure-active-directory-msi-vm') {
              loginWithVmMSI({
                clientId: authentication.options.clientId,
                msiEndpoint: authentication.options.msiEndpoint,
                resource: fedAuthInfoToken.spn
              }, getTokenFromCredentials);
            } else if (authentication.type === 'azure-active-directory-msi-app-service') {
              loginWithAppServiceMSI({
                msiEndpoint: authentication.options.msiEndpoint,
                msiSecret: authentication.options.msiSecret,
                resource: fedAuthInfoToken.spn
              }, getTokenFromCredentials);
            } else if (authentication.type === 'azure-active-directory-service-principal-secret') {
              loginWithServicePrincipalSecret(
                authentication.options.clientId,
                authentication.options.clientSecret,
                authentication.options.tenantId,
                { tokenAudience: fedAuthInfoToken.spn },
                getTokenFromCredentials
              );
            }
          };

          getToken((err, token) => {
            if (err) {
              this.loginError = ConnectionError('Security token could not be authenticated or authorized.', 'EFEDAUTH');
              this.emit('connect', this.loginError);
              this.transitionTo(this.STATE.FINAL);
              return;
            }

            this.sendFedAuthTokenMessage(token!);
          });
        } else if (this.loginError) {
          if (this.loginError.isTransient) {
            this.debug.log('Initiating retry on transient error');
            this.transitionTo(this.STATE.TRANSIENT_FAILURE_RETRY);
          } else {
            this.emit('connect', this.loginError);
            this.transitionTo(this.STATE.FINAL);
          }
        } else {
          this.emit('connect', ConnectionError('Login failed.', 'ELOGIN'));
          this.transitionTo(this.STATE.FINAL);
        }
      }
    }
  },
  LOGGED_IN_SENDING_INITIAL_SQL: {
    name: 'LoggedInSendingInitialSql',
    enter: function() {
      this.sendInitialSql();
    },
    events: {
      socketError: function socketError() {
        this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        this.sendDataToTokenStreamParser(data);
      },
      message: function() {
        this.tokenStreamParser.addEndOfMessageMarker();
      },
      endOfMessageMarkerReceived: function() {
        this.transitionTo(this.STATE.LOGGED_IN);
        this.processedInitialSql();
      }
    }
  },
  LOGGED_IN: {
    name: 'LoggedIn',
    events: {
      socketError: function() {
        this.transitionTo(this.STATE.FINAL);
      }
    }
  },
  SENT_CLIENT_REQUEST: {
    name: 'SentClientRequest',
    exit: function(nextState) {
      this.clearRequestTimer();
      if (nextState !== this.STATE.FINAL) {
        this.tokenStreamParser.resume();
      }
    },
    events: {
      socketError: function(err) {
        const sqlRequest = this.request!;
        this.request = undefined;
        this.transitionTo(this.STATE.FINAL);

        sqlRequest.callback(err);
      },
      data: function(data) {
        this.clearRequestTimer(); // request timer is stopped on first data package
        const ret = this.sendDataToTokenStreamParser(data);
        if (ret === false) {
          // Bridge backpressure from the token stream parser transform to the
          // packet stream transform.
          this.messageIo.pause();
        }
      },
      message: function() {
        // We have to channel the 'message' (EOM) event through the token stream
        // parser transform, to keep it in line with the flow of the tokens, when
        // the incoming data flow is paused and resumed.
        this.tokenStreamParser.addEndOfMessageMarker();
      },
      endOfMessageMarkerReceived: function() {
        this.transitionTo(this.STATE.LOGGED_IN);
        const sqlRequest = this.request as Request;
        this.request = undefined;
        if (this.config.options.tdsVersion < '7_2' && sqlRequest.error && this.isSqlBatch) {
          this.inTransaction = false;
        }
        sqlRequest.callback(sqlRequest.error, sqlRequest.rowCount, sqlRequest.rows);
      }
    }
  },
  SENT_ATTENTION: {
    name: 'SentAttention',
    enter: function() {
      this.attentionReceived = false;
    },
    events: {
      socketError: function(err) {
        const sqlRequest = this.request!;
        this.request = undefined;

        this.transitionTo(this.STATE.FINAL);

        sqlRequest.callback(err);
      },
      data: function(data) {
        this.sendDataToTokenStreamParser(data);
      },
      attention: function() {
        this.attentionReceived = true;
      },
      endOfMessageMarkerReceived: function() {
        // 3.2.5.7 Sent Attention State
        // Discard any data contained in the response, until we receive the attention response
        if (this.attentionReceived) {
          this.clearCancelTimer();

          const sqlRequest = this.request!;
          this.request = undefined;
          this.transitionTo(this.STATE.LOGGED_IN);

          if (sqlRequest.error && sqlRequest.error instanceof RequestError && sqlRequest.error.code === 'ETIMEOUT') {
            sqlRequest.callback(sqlRequest.error);
          } else {
            sqlRequest.callback(RequestError('Canceled.', 'ECANCEL'));
          }
        }
      },
      message: function() {
        this.tokenStreamParser.addEndOfMessageMarker();
      }
    }
  },
  FINAL: {
    name: 'Final',
    enter: function() {
      this.cleanupConnection(CLEANUP_TYPE.NORMAL);
    },
    events: {
      loginFailed: function() {
        // Do nothing. The connection was probably closed by the client code.
      },
      connectTimeout: function() {
        // Do nothing, as the timer should be cleaned up.
      },
      message: function() {
        // Do nothing
      },
      socketError: function() {
        // Do nothing
      }
    }
  }
};
