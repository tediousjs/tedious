import crypto from 'crypto';
import os from 'os';
import * as tls from 'tls';
import * as net from 'net';
import dns from 'dns';

import constants from 'constants';
import { type SecureContextOptions } from 'tls';

import { Readable } from 'stream';

import {
  ClientSecretCredential,
  DefaultAzureCredential,
  ManagedIdentityCredential,
  UsernamePasswordCredential
} from '@azure/identity';
import { type AccessToken, type TokenCredential, isTokenCredential } from '@azure/core-auth';

import BulkLoad, { type Options as BulkLoadOptions, type Callback as BulkLoadCallback } from './bulk-load';
import Debug from './debug';
import { EventEmitter, once } from 'events';
import { instanceLookup } from './instance-lookup';
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
import { connectInParallel, connectInSequence } from './connector';
import { name as libraryName } from './library';
import { versions } from './tds-versions';
import Message from './message';
import { type Metadata } from './metadata-parser';
import { createNTLMRequest } from './ntlm';
import { ColumnEncryptionAzureKeyVaultProvider } from './always-encrypted/keystore-provider-azure-key-vault';

import { type Parameter, TYPES } from './data-type';
import { BulkLoadPayload } from './bulk-load-payload';
import { Collation } from './collation';
import Procedures from './special-stored-procedure';

import { version } from '../package.json';
import { URL } from 'url';
import { AttentionTokenHandler, InitialSqlTokenHandler, Login7TokenHandler, RequestTokenHandler, TokenHandler } from './token/handler';

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
const DEFAULT_TEXTSIZE = 2147483647;
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
     * they need to provide `clientId` associate to their created identity.
     *
     * This is optional for retrieve token from azure web app service
     */
    clientId?: string;
  };
}

interface AzureActiveDirectoryMsiVmAuthentication {
  type: 'azure-active-directory-msi-vm';
  options: {
    /**
     * If you want to connect using a specific client account
     * they need to provide `clientId` associated to their created identity.
     *
     * This is optional for retrieve a token
     */
    clientId?: string;
  };
}

interface AzureActiveDirectoryDefaultAuthentication {
  type: 'azure-active-directory-default';
  options: {
    /**
     * If you want to connect using a specific client account
     * they need to provide `clientId` associated to their created identity.
     *
     * This is optional for retrieving a token
     */
    clientId?: string;
  };
}


interface AzureActiveDirectoryAccessTokenAuthentication {
  type: 'azure-active-directory-access-token';
  options: {
    /**
     * A user need to provide `token` which they retrieved else where
     * to forming the connection.
     */
    token: string;
  };
}

interface AzureActiveDirectoryPasswordAuthentication {
  type: 'azure-active-directory-password';
  options: {
    /**
     * A user need to provide `userName` associate to their account.
     */
    userName: string;

    /**
     * A user need to provide `password` associate to their account.
     */
    password: string;

    /**
     * A client id to use.
     */
    clientId: string;

    /**
     * Optional parameter for specific Azure tenant ID
     */
    tenantId: string;
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

/** Structure that defines the options that are necessary to authenticate the Tedious.JS instance with an `@azure/identity` token credential. */
interface TokenCredentialAuthentication {
  /** Unique designator for the type of authentication to be used. */
  type: 'token-credential';
  /** Set of configurations that are required or allowed with this authentication type. */
  options: {
    /** Credential object used to authenticate to the resource. */
    credential: TokenCredential;
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
    userName?: string | undefined;
    /**
     * Password to use for sql server login.
     */
    password?: string | undefined;
  };
}

interface ErrorWithCode extends Error {
  code?: string;
}

export type ConnectionAuthentication = DefaultAuthentication | NtlmAuthentication | TokenCredentialAuthentication | AzureActiveDirectoryPasswordAuthentication | AzureActiveDirectoryMsiAppServiceAuthentication | AzureActiveDirectoryMsiVmAuthentication | AzureActiveDirectoryAccessTokenAuthentication | AzureActiveDirectoryServicePrincipalSecret | AzureActiveDirectoryDefaultAuthentication;

interface InternalConnectionConfig {
  server: string;
  authentication: ConnectionAuthentication;
  options: InternalConnectionOptions;
}

export interface InternalConnectionOptions {
  abortTransactionOnError: boolean;
  appName: undefined | string;
  camelCaseColumns: boolean;
  cancelTimeout: number;
  columnEncryptionKeyCacheTTL: number;
  columnEncryptionSetting: boolean;
  columnNameReplacer: undefined | ((colName: string, index: number, metadata: Metadata) => string);
  connectionRetryInterval: number;
  connector: undefined | (() => Promise<net.Socket>);
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
  encrypt: string | boolean;
  encryptionKeyStoreProviders: KeyStoreProviderMap | undefined;
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
  textsize: number;
  trustedServerNameAE: string | undefined;
  trustServerCertificate: boolean;
  useColumnNames: boolean;
  useUTC: boolean;
  workstationId: undefined | string;
  lowerCaseGuids: boolean;
}

interface KeyStoreProviderMap {
  [key: string]: ColumnEncryptionAzureKeyVaultProvider;
}

/**
 * @private
 */
interface State {
  name: string;
  enter?(this: Connection): void;
  exit?(this: Connection, newState: State): void;
  events: {
    socketError?(this: Connection, err: Error): void;
    message?(this: Connection, message: Message): void;
  };
}

type Authentication = DefaultAuthentication |
  NtlmAuthentication |
  TokenCredentialAuthentication |
  AzureActiveDirectoryPasswordAuthentication |
  AzureActiveDirectoryMsiAppServiceAuthentication |
  AzureActiveDirectoryMsiVmAuthentication |
  AzureActiveDirectoryAccessTokenAuthentication |
  AzureActiveDirectoryServicePrincipalSecret |
  AzureActiveDirectoryDefaultAuthentication;

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
   * Authentication related options for connection.
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
   * `azure-active-directory-default`
   * or `azure-active-directory-service-principal-secret`
   */
  type?: AuthenticationType;
  /**
   * Different options for authentication types:
   *
   * * `default`: [[DefaultAuthentication.options]]
   * * `ntlm` :[[NtlmAuthentication]]
   * * `token-credential`: [[CredentialChainAuthentication.options]]
   * * `azure-active-directory-password` : [[AzureActiveDirectoryPasswordAuthentication.options]]
   * * `azure-active-directory-access-token` : [[AzureActiveDirectoryAccessTokenAuthentication.options]]
   * * `azure-active-directory-msi-vm` : [[AzureActiveDirectoryMsiVmAuthentication.options]]
   * * `azure-active-directory-msi-app-service` : [[AzureActiveDirectoryMsiAppServiceAuthentication.options]]
   * * `azure-active-directory-service-principal-secret` : [[AzureActiveDirectoryServicePrincipalSecret.options]]
   * * `azure-active-directory-default` : [[AzureActiveDirectoryDefaultAuthentication.options]]
   */
  options?: any;
}

export interface ConnectionOptions {
  /**
   * A boolean determining whether to rollback a transaction automatically if any error is encountered
   * during the given transaction's execution. This sets the value for `SET XACT_ABORT` during the
   * initial SQL phase of a connection [documentation](https://docs.microsoft.com/en-us/sql/t-sql/statements/set-xact-abort-transact-sql).
   */
  abortTransactionOnError?: boolean | undefined;

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

  /**
   * A function with parameters `(columnName, index, columnMetaData)` and returning a string. If provided,
   * this will be called once per column per result-set. The returned value will be used instead of the SQL-provided
   * column name on row and meta data objects. This allows you to dynamically convert between naming conventions.
   *
   * (default: `null`)
   */
  columnNameReplacer?: (colName: string, index: number, metadata: Metadata) => string;

  /**
   * Number of milliseconds before retrying to establish connection, in case of transient failure.
   *
   * (default:`500`)
   */
  connectionRetryInterval?: number;

  /**
   * Custom connector factory method.
   *
   * (default: `undefined`)
   */
  connector?: () => Promise<net.Socket>;

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
  cryptoCredentialsDetails?: SecureContextOptions;

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
   * A string value that can be only set to 'strict', which indicates the usage TDS 8.0 protocol. Otherwise,
   * a boolean determining whether or not the connection will be encrypted.
   *
   * (default: `true`)
   */
  encrypt?: string | boolean;

  /**
   * By default, if the database requested by [[database]] cannot be accessed,
   * the connection will fail with an error. However, if [[fallbackToDefaultDb]] is
   * set to `true`, then the user's default database will be used instead
   *
   * (default: `false`)
   */
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
   * A boolean determining whether to parse unique identifier type with lowercase case characters.
   *
   * (default: `false`).
   */
  lowerCaseGuids?: boolean;

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
  port?: number | undefined;

  /**
   * A boolean, determining whether the connection will request read only access from a SQL Server Availability
   * Group. For more information, see [here](http://msdn.microsoft.com/en-us/library/hh710054.aspx "Microsoft: Configure Read-Only Routing for an Availability Group (SQL Server)")
   *
   * (default: `false`).
   */
  readOnlyIntent?: boolean;

  /**
   * The number of milliseconds before a request is considered failed, or `0` for no timeout.
   *
   * As soon as a response is received, the timeout is cleared. This means that queries that immediately return a response have ability to run longer than this timeout.
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
  tdsVersion?: string | undefined;

  /**
   * Specifies the size of varchar(max), nvarchar(max), varbinary(max), text, ntext, and image data returned by a SELECT statement.
   *
   * (default: `2147483647`)
   */
  textsize?: number;

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
   *
   */
  serverName?: string;
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
   * The workstation ID (WSID) of the client, default os.hostname().
   * Used for identifying a specific client in profiling, logging or
   * tracing client activity in SQLServer.
   *
   * The value is reported by the TSQL function HOST_NAME().
   */
  workstationId?: string | undefined;
}

interface RoutingData {
  server: string;
  port: number;
  login7server: string;
}

/**
 * Helper function, equivalent to `Promise.withResolvers()`.
 *
 * @returns An object with the properties `promise`, `resolve`, and `reject`.
 */
function withResolvers<T>() {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve: resolve!, reject: reject! };
}

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
  declare fedAuthRequired: boolean;
  /**
   * @private
   */
  declare config: InternalConnectionConfig;
  /**
   * @private
   */
  declare secureContextOptions: SecureContextOptions;
  /**
   * @private
   */
  declare inTransaction: boolean;
  /**
   * @private
   */
  declare transactionDescriptors: Buffer[];
  /**
   * @private
   */
  declare transactionDepth: number;
  /**
   * @private
   */
  declare isSqlBatch: boolean;
  /**
   * @private
   */
  declare curTransientRetryCount: number;
  /**
   * @private
   */
  declare transientErrorLookup: TransientErrorLookup;
  /**
   * @private
   */
  declare closed: boolean;
  /**
   * @private
   */
  declare loginError: undefined | AggregateError | ConnectionError;
  /**
   * @private
   */
  declare debug: Debug;
  /**
   * @private
   */
  declare ntlmpacket: undefined | any;
  /**
   * @private
   */
  declare ntlmpacketBuffer: undefined | Buffer;

  /**
   * @private
   */
  declare STATE: {
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
  };

  /**
   * @private
   */
  declare routingData: undefined | RoutingData;

  /**
   * @private
   */
  declare messageIo: MessageIO;
  /**
   * @private
   */
  declare state: State;
  /**
   * @private
   */
  declare resetConnectionOnNextRequest: undefined | boolean;

  /**
   * @private
   */
  declare request: undefined | Request | BulkLoad;
  /**
   * @private
   */
  declare procReturnStatusValue: undefined | any;
  /**
   * @private
   */
  declare socket: undefined | net.Socket;
  /**
   * @private
   */
  declare messageBuffer: Buffer;

  /**
   * @private
   */
  declare cancelTimer: undefined | NodeJS.Timeout;
  /**
   * @private
   */
  declare requestTimer: undefined | NodeJS.Timeout;

  /**
   * @private
   */
  declare _cancelAfterRequestSent: () => void;

  /**
   * @private
   */
  declare databaseCollation: Collation | undefined;

  /**
   * @private
   */
  declare _onSocketClose: (hadError: boolean) => void;

  /**
   * @private
   */
  declare _onSocketError: (err: Error) => void;

  /**
   * @private
   */
  declare _onSocketEnd: () => void;

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

    let authentication: ConnectionAuthentication;
    if (config.authentication !== undefined) {
      if (typeof config.authentication !== 'object' || config.authentication === null) {
        throw new TypeError('The "config.authentication" property must be of type Object.');
      }

      const type = config.authentication.type;
      const options = config.authentication.options === undefined ? {} : config.authentication.options;

      if (typeof type !== 'string') {
        throw new TypeError('The "config.authentication.type" property must be of type string.');
      }

      if (type !== 'default' && type !== 'ntlm' && type !== 'token-credential' && type !== 'azure-active-directory-password' && type !== 'azure-active-directory-access-token' && type !== 'azure-active-directory-msi-vm' && type !== 'azure-active-directory-msi-app-service' && type !== 'azure-active-directory-service-principal-secret' && type !== 'azure-active-directory-default') {
        throw new TypeError('The "type" property must one of "default", "ntlm", "token-credential", "azure-active-directory-password", "azure-active-directory-access-token", "azure-active-directory-default", "azure-active-directory-msi-vm" or "azure-active-directory-msi-app-service" or "azure-active-directory-service-principal-secret".');
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
      } else if (type === 'token-credential') {
        if (!isTokenCredential(options.credential)) {
          throw new TypeError('The "config.authentication.options.credential" property must be an instance of the token credential class.');
        }

        authentication = {
          type: 'token-credential',
          options: {
            credential: options.credential
          }
        };
      } else if (type === 'azure-active-directory-password') {
        if (typeof options.clientId !== 'string') {
          throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
        }

        if (options.userName !== undefined && typeof options.userName !== 'string') {
          throw new TypeError('The "config.authentication.options.userName" property must be of type string.');
        }

        if (options.password !== undefined && typeof options.password !== 'string') {
          throw new TypeError('The "config.authentication.options.password" property must be of type string.');
        }

        if (options.tenantId !== undefined && typeof options.tenantId !== 'string') {
          throw new TypeError('The "config.authentication.options.tenantId" property must be of type string.');
        }

        authentication = {
          type: 'azure-active-directory-password',
          options: {
            userName: options.userName,
            password: options.password,
            tenantId: options.tenantId,
            clientId: options.clientId
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

        authentication = {
          type: 'azure-active-directory-msi-vm',
          options: {
            clientId: options.clientId
          }
        };
      } else if (type === 'azure-active-directory-default') {
        if (options.clientId !== undefined && typeof options.clientId !== 'string') {
          throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
        }
        authentication = {
          type: 'azure-active-directory-default',
          options: {
            clientId: options.clientId
          }
        };
      } else if (type === 'azure-active-directory-msi-app-service') {
        if (options.clientId !== undefined && typeof options.clientId !== 'string') {
          throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
        }

        authentication = {
          type: 'azure-active-directory-msi-app-service',
          options: {
            clientId: options.clientId
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
        columnEncryptionKeyCacheTTL: 2 * 60 * 60 * 1000,  // Units: milliseconds
        columnEncryptionSetting: false,
        columnNameReplacer: undefined,
        connectionRetryInterval: DEFAULT_CONNECT_RETRY_INTERVAL,
        connectTimeout: DEFAULT_CONNECT_TIMEOUT,
        connector: undefined,
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
        trustedServerNameAE: undefined,
        trustServerCertificate: false,
        useColumnNames: false,
        useUTC: true,
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

      if (config.options.connector !== undefined) {
        if (typeof config.options.connector !== 'function') {
          throw new TypeError('The "config.options.connector" property must be a function.');
        }

        this.config.options.connector = config.options.connector;
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
          if (config.options.encrypt !== 'strict') {
            throw new TypeError('The "encrypt" property must be set to "strict", or of type boolean.');
          }
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

        if (config.options.textsize > 2147483647) {
          throw new TypeError('The "config.options.textsize" can\'t be greater than 2147483647.');
        } else if (config.options.textsize < -1) {
          throw new TypeError('The "config.options.textsize" can\'t be smaller than -1.');
        }

        this.config.options.textsize = config.options.textsize | 0;
      }

      if (config.options.trustServerCertificate !== undefined) {
        if (typeof config.options.trustServerCertificate !== 'boolean') {
          throw new TypeError('The "config.options.trustServerCertificate" property must be of type boolean.');
        }

        this.config.options.trustServerCertificate = config.options.trustServerCertificate;
      }

      if (config.options.serverName !== undefined) {
        if (typeof config.options.serverName !== 'string') {
          throw new TypeError('The "config.options.serverName" property must be of type string.');
        }
        this.config.options.serverName = config.options.serverName;
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

      if (config.options.workstationId !== undefined) {
        if (typeof config.options.workstationId !== 'string') {
          throw new TypeError('The "config.options.workstationId" property must be of type string.');
        }

        this.config.options.workstationId = config.options.workstationId;
      }

      if (config.options.lowerCaseGuids !== undefined) {
        if (typeof config.options.lowerCaseGuids !== 'boolean') {
          throw new TypeError('The "config.options.lowerCaseGuids" property must be of type boolean.');
        }

        this.config.options.lowerCaseGuids = config.options.lowerCaseGuids;
      }
    }

    this.secureContextOptions = this.config.options.cryptoCredentialsDetails;
    if (this.secureContextOptions.secureOptions === undefined) {
      // If the caller has not specified their own `secureOptions`,
      // we set `SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS` here.
      // Older SQL Server instances running on older Windows versions have
      // trouble with the BEAST workaround in OpenSSL.
      // As BEAST is a browser specific exploit, we can just disable this option here.
      this.secureContextOptions = Object.create(this.secureContextOptions, {
        secureOptions: {
          value: constants.SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS
        }
      });
    }

    this.debug = this.createDebug();
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
    this.messageBuffer = Buffer.alloc(0);

    this.curTransientRetryCount = 0;
    this.transientErrorLookup = new TransientErrorLookup();

    this.state = this.STATE.INITIALIZED;

    this._cancelAfterRequestSent = () => {
      this.messageIo.sendMessage(TYPE.ATTENTION);
      this.createCancelTimer();
    };

    this._onSocketClose = () => {
      this.socketClose();
    };

    this._onSocketEnd = () => {
      this.socketEnd();
    };

    this._onSocketError = (error) => {
      this.dispatchEvent('socketError', error);
      process.nextTick(() => {
        this.emit('error', this.wrapSocketError(error));
      });
    };
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
    this.initialiseConnection().then(() => {
      process.nextTick(() => {
        this.emit('connect');
      });
    }, (err) => {
      this.transitionTo(this.STATE.FINAL);
      this.closed = true;

      process.nextTick(() => {
        this.emit('connect', err);
      });
      process.nextTick(() => {
        this.emit('end');
      });
    });
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
   * The connection was reset.
   */
  on(event: 'resetConnection', listener: () => void): this

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
    this.cleanupConnection();
  }

  /**
   * @private
   */
  async initialiseConnection() {
    const timeoutController = new AbortController();

    const connectTimer = setTimeout(() => {
      const hostPostfix = this.config.options.port ? `:${this.config.options.port}` : `\\${this.config.options.instanceName}`;
      // If we have routing data stored, this connection has been redirected
      const server = this.routingData ? this.routingData.server : this.config.server;
      const port = this.routingData ? `:${this.routingData.port}` : hostPostfix;
      // Grab the target host from the connection configuration, and from a redirect message
      // otherwise, leave the message empty.
      const routingMessage = this.routingData ? ` (redirected from ${this.config.server}${hostPostfix})` : '';
      const message = `Failed to connect to ${server}${port}${routingMessage} in ${this.config.options.connectTimeout}ms`;
      this.debug.log(message);

      timeoutController.abort(new ConnectionError(message, 'ETIMEOUT'));
    }, this.config.options.connectTimeout);

    try {
      let signal = timeoutController.signal;

      let port = this.config.options.port;

      if (!port) {
        try {
          port = await instanceLookup({
            server: this.config.server,
            instanceName: this.config.options.instanceName!,
            timeout: this.config.options.connectTimeout,
            signal: signal
          });
        } catch (err: any) {
          signal.throwIfAborted();

          throw new ConnectionError(err.message, 'EINSTLOOKUP', { cause: err });
        }
      }

      let socket;
      try {
        socket = await this.connectOnPort(port, this.config.options.multiSubnetFailover, signal, this.config.options.connector);
      } catch (err: any) {
        signal.throwIfAborted();

        throw this.wrapSocketError(err);
      }

      try {
        const controller = new AbortController();
        const onError = (err: Error) => {
          controller.abort(this.wrapSocketError(err));
        };
        const onClose = () => {
          this.debug.log('connection to ' + this.config.server + ':' + this.config.options.port + ' closed');
        };
        const onEnd = () => {
          this.debug.log('socket ended');

          const error: ErrorWithCode = new Error('socket hang up');
          error.code = 'ECONNRESET';
          controller.abort(this.wrapSocketError(error));
        };

        socket.once('error', onError);
        socket.once('close', onClose);
        socket.once('end', onEnd);

        try {
          signal = AbortSignal.any([signal, controller.signal]);

          socket.setKeepAlive(true, KEEP_ALIVE_INITIAL_DELAY);

          this.messageIo = new MessageIO(socket, this.config.options.packetSize, this.debug);
          this.messageIo.on('secure', (cleartext) => { this.emit('secure', cleartext); });

          this.socket = socket;

          this.closed = false;
          this.debug.log('connected to ' + this.config.server + ':' + this.config.options.port);

          this.sendPreLogin();

          this.transitionTo(this.STATE.SENT_PRELOGIN);
          const preloginResponse = await this.readPreloginResponse(signal);
          await this.performTlsNegotiation(preloginResponse, signal);

          this.sendLogin7Packet();

          try {
            const { authentication } = this.config;
            switch (authentication.type) {
              case 'token-credential':
              case 'azure-active-directory-password':
              case 'azure-active-directory-msi-vm':
              case 'azure-active-directory-msi-app-service':
              case 'azure-active-directory-service-principal-secret':
              case 'azure-active-directory-default':
                this.transitionTo(this.STATE.SENT_LOGIN7_WITH_FEDAUTH);
                this.routingData = await this.performSentLogin7WithFedAuth(signal);
                break;
              case 'ntlm':
                this.transitionTo(this.STATE.SENT_LOGIN7_WITH_NTLM);
                this.routingData = await this.performSentLogin7WithNTLMLogin(signal);
                break;
              default:
                this.transitionTo(this.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
                this.routingData = await this.performSentLogin7WithStandardLogin(signal);
                break;
            }
          } catch (err: any) {
            if (isTransientError(err)) {
              this.debug.log('Initiating retry on transient error');
              this.transitionTo(this.STATE.TRANSIENT_FAILURE_RETRY);
              return await this.performTransientFailureRetry();
            }

            throw err;
          }

          // If routing data is present, we need to re-route the connection
          if (this.routingData) {
            this.transitionTo(this.STATE.REROUTING);
            return await this.performReRouting();
          }

          this.transitionTo(this.STATE.LOGGED_IN_SENDING_INITIAL_SQL);
          await this.performLoggedInSendingInitialSql(signal);
        } finally {
          socket.removeListener('error', onError);
          socket.removeListener('close', onClose);
          socket.removeListener('end', onEnd);
        }
      } catch (err) {
        socket.destroy();

        throw err;
      }

      socket.on('error', this._onSocketError);
      socket.on('close', this._onSocketClose);
      socket.on('end', this._onSocketEnd);

      this.transitionTo(this.STATE.LOGGED_IN);
    } finally {
      clearTimeout(connectTimer);
    }
  }

  /**
   * @private
   */
  cleanupConnection() {
    if (!this.closed) {
      this.clearRequestTimer();
      this.closeConnection();

      process.nextTick(() => {
        this.emit('end');
      });

      const request = this.request;
      if (request) {
        const err = new RequestError('Connection closed before request completed.', 'ECLOSE');
        request.callback(err);
        this.request = undefined;
      }

      this.closed = true;
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
  createTokenStreamParser(message: Message, handler: TokenHandler) {
    return new TokenStreamParser(message, this.debug, handler, this.config.options);
  }

  async wrapWithTls(socket: net.Socket, signal: AbortSignal): Promise<tls.TLSSocket> {
    signal.throwIfAborted();

    const secureContext = tls.createSecureContext(this.secureContextOptions);
    // If connect to an ip address directly,
    // need to set the servername to an empty string
    // if the user has not given a servername explicitly
    const serverName = !net.isIP(this.config.server) ? this.config.server : '';
    const encryptOptions = {
      host: this.config.server,
      socket: socket,
      ALPNProtocols: ['tds/8.0'],
      secureContext: secureContext,
      servername: this.config.options.serverName ? this.config.options.serverName : serverName,
    };

    const { promise, resolve, reject } = withResolvers<tls.TLSSocket>();
    const encryptsocket = tls.connect(encryptOptions);

    try {
      const onAbort = () => { reject(signal.reason); };
      signal.addEventListener('abort', onAbort, { once: true });

      try {
        const onError = reject;
        const onConnect = () => { resolve(encryptsocket); };

        encryptsocket.once('error', onError);
        encryptsocket.once('secureConnect', onConnect);

        try {
          return await promise;
        } finally {
          encryptsocket.removeListener('error', onError);
          encryptsocket.removeListener('connect', onConnect);
        }
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    } catch (err: any) {
      encryptsocket.destroy();

      throw err;
    }
  }

  async connectOnPort(port: number, multiSubnetFailover: boolean, signal: AbortSignal, customConnector?: () => Promise<net.Socket>) {
    const connectOpts = {
      host: this.routingData ? this.routingData.server : this.config.server,
      port: this.routingData ? this.routingData.port : port,
      localAddress: this.config.options.localAddress
    };

    const connect = customConnector || (multiSubnetFailover ? connectInParallel : connectInSequence);

    let socket = await connect(connectOpts, dns.lookup, signal);

    if (this.config.options.encrypt === 'strict') {
      try {
        // Wrap the socket with TLS for TDS 8.0
        socket = await this.wrapWithTls(socket, signal);
      } catch (err) {
        socket.end();

        throw err;
      }
    }

    return socket;
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
  cancelTimeout() {
    const message = `Failed to cancel request in ${this.config.options.cancelTimeout}ms`;
    this.debug.log(message);
    this.dispatchEvent('socketError', new ConnectionError(message, 'ETIMEOUT'));
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
    request.error = new RequestError(message, 'ETIMEOUT');
  }

  /**
   * @private
   */
  clearCancelTimer() {
    if (this.cancelTimer) {
      clearTimeout(this.cancelTimer);
      this.cancelTimer = undefined;
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
    const handler = this.state.events[eventName] as ((this: Connection, ...args: any[]) => void) | undefined;
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
  wrapSocketError(error: Error): ConnectionError {
    if (this.state === this.STATE.CONNECTING || this.state === this.STATE.SENT_TLSSSLNEGOTIATION) {
      const hostPostfix = this.config.options.port ? `:${this.config.options.port}` : `\\${this.config.options.instanceName}`;
      // If we have routing data stored, this connection has been redirected
      const server = this.routingData ? this.routingData.server : this.config.server;
      const port = this.routingData ? `:${this.routingData.port}` : hostPostfix;
      // Grab the target host from the connection configuration, and from a redirect message
      // otherwise, leave the message empty.
      const routingMessage = this.routingData ? ` (redirected from ${this.config.server}${hostPostfix})` : '';
      const message = `Failed to connect to ${server}${port}${routingMessage} - ${error.message}`;

      return new ConnectionError(message, 'ESOCKET', { cause: error });
    } else {
      const message = `Connection lost - ${error.message}`;
      return new ConnectionError(message, 'ESOCKET', { cause: error });
    }
  }

  /**
   * @private
   */
  socketEnd() {
    this.debug.log('socket ended');
    if (this.state !== this.STATE.FINAL) {
      const error: ErrorWithCode = new Error('socket hang up');
      error.code = 'ECONNRESET';

      this.dispatchEvent('socketError', error);
      process.nextTick(() => {
        this.emit('error', this.wrapSocketError(error));
      });
    }
  }

  /**
   * @private
   */
  socketClose() {
    this.debug.log('connection to ' + this.config.server + ':' + this.config.options.port + ' closed');
    this.transitionTo(this.STATE.FINAL);
    this.cleanupConnection();
  }

  /**
   * @private
   */
  sendPreLogin() {
    const [, major, minor, build] = /^(\d+)\.(\d+)\.(\d+)/.exec(version) ?? ['0.0.0', '0', '0', '0'];
    const payload = new PreloginPayload({
      // If encrypt setting is set to 'strict', then we should have already done the encryption before calling
      // this function. Therefore, the encrypt will be set to false here.
      // Otherwise, we will set encrypt here based on the encrypt Boolean value from the configuration.
      encrypt: typeof this.config.options.encrypt === 'boolean' && this.config.options.encrypt,
      version: { major: Number(major), minor: Number(minor), build: Number(build), subbuild: 0 }
    });

    this.messageIo.sendMessage(TYPE.PRELOGIN, payload.data);
    this.debug.payload(function() {
      return payload.toString('  ');
    });
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

      case 'token-credential':
      case 'azure-active-directory-msi-vm':
      case 'azure-active-directory-default':
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
    payload.serverName = this.routingData ? this.routingData.login7server : this.config.server;
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
    try {
      request.validateParameters(this.databaseCollation);
    } catch (error: any) {
      request.error = error;

      process.nextTick(() => {
        this.debug.log(error.message);
        request.callback(error);
      });

      return;
    }

    const parameters: Parameter[] = [];

    parameters.push({
      type: TYPES.NVarChar,
      name: 'statement',
      value: request.sqlTextOrProcedure,
      output: false,
      length: undefined,
      precision: undefined,
      scale: undefined
    });

    if (request.parameters.length) {
      parameters.push({
        type: TYPES.NVarChar,
        name: 'params',
        value: request.makeParamsParameter(request.parameters),
        output: false,
        length: undefined,
        precision: undefined,
        scale: undefined
      });

      parameters.push(...request.parameters);
    }

    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(Procedures.Sp_ExecuteSql, parameters, this.currentTransactionDescriptor(), this.config.options, this.databaseCollation));
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
    return new BulkLoad(table, this.databaseCollation, this.config.options, options, callback);
  }

  /**
   * Execute a [[BulkLoad]].
   *
   * ```js
   * // We want to perform a bulk load into a table with the following format:
   * // CREATE TABLE employees (first_name nvarchar(255), last_name nvarchar(255), day_of_birth date);
   *
   * const bulkLoad = connection.newBulkLoad('employees', (err, rowCount) => {
   *   // ...
   * });
   *
   * // First, we need to specify the columns that we want to write to,
   * // and their definitions. These definitions must match the actual table,
   * // otherwise the bulk load will fail.
   * bulkLoad.addColumn('first_name', TYPES.NVarchar, { nullable: false });
   * bulkLoad.addColumn('last_name', TYPES.NVarchar, { nullable: false });
   * bulkLoad.addColumn('date_of_birth', TYPES.Date, { nullable: false });
   *
   * // Execute a bulk load with a predefined list of rows.
   * //
   * // Note that these rows are held in memory until the
   * // bulk load was performed, so if you need to write a large
   * // number of rows (e.g. by reading from a CSV file),
   * // passing an `AsyncIterable` is advisable to keep memory usage low.
   * connection.execBulkLoad(bulkLoad, [
   *   { 'first_name': 'Steve', 'last_name': 'Jobs', 'day_of_birth': new Date('02-24-1955') },
   *   { 'first_name': 'Bill', 'last_name': 'Gates', 'day_of_birth': new Date('10-28-1955') }
   * ]);
   * ```
   *
   * @param bulkLoad A previously created [[BulkLoad]].
   * @param rows A [[Iterable]] or [[AsyncIterable]] that contains the rows that should be bulk loaded.
   */
  execBulkLoad(bulkLoad: BulkLoad, rows: AsyncIterable<unknown[] | { [columnName: string]: unknown }> | Iterable<unknown[] | { [columnName: string]: unknown }>): void

  execBulkLoad(bulkLoad: BulkLoad, rows?: AsyncIterable<unknown[] | { [columnName: string]: unknown }> | Iterable<unknown[] | { [columnName: string]: unknown }>) {
    bulkLoad.executionStarted = true;

    if (rows) {
      if (bulkLoad.streamingMode) {
        throw new Error("Connection.execBulkLoad can't be called with a BulkLoad that was put in streaming mode.");
      }

      if (bulkLoad.firstRowWritten) {
        throw new Error("Connection.execBulkLoad can't be called with a BulkLoad that already has rows written to it.");
      }

      const rowStream = Readable.from(rows);

      // Destroy the packet transform if an error happens in the row stream,
      // e.g. if an error is thrown from within a generator or stream.
      rowStream.on('error', (err) => {
        bulkLoad.rowToPacketTransform.destroy(err);
      });

      // Destroy the row stream if an error happens in the packet transform,
      // e.g. if the bulk load is cancelled.
      bulkLoad.rowToPacketTransform.on('error', (err) => {
        rowStream.destroy(err);
      });

      rowStream.pipe(bulkLoad.rowToPacketTransform);
    } else if (!bulkLoad.streamingMode) {
      // If the bulkload was not put into streaming mode by the user,
      // we end the rowToPacketTransform here for them.
      //
      // If it was put into streaming mode, it's the user's responsibility
      // to end the stream.
      bulkLoad.rowToPacketTransform.end();
    }

    const onCancel = () => {
      request.cancel();
    };

    const payload = new BulkLoadPayload(bulkLoad);

    const request = new Request(bulkLoad.getBulkInsertSql(), (error: (Error & { code?: string }) | null | undefined) => {
      bulkLoad.removeListener('cancel', onCancel);

      if (error) {
        if (error.code === 'UNKNOWN') {
          error.message += ' This is likely because the schema of the BulkLoad does not match the schema of the table you are attempting to insert into.';
        }
        bulkLoad.error = error;
        bulkLoad.callback(error);
        return;
      }

      this.makeRequest(bulkLoad, TYPE.BULK_LOAD, payload);
    });

    bulkLoad.once('cancel', onCancel);

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
    const parameters: Parameter[] = [];

    parameters.push({
      type: TYPES.Int,
      name: 'handle',
      value: undefined,
      output: true,
      length: undefined,
      precision: undefined,
      scale: undefined
    });

    parameters.push({
      type: TYPES.NVarChar,
      name: 'params',
      value: request.parameters.length ? request.makeParamsParameter(request.parameters) : null,
      output: false,
      length: undefined,
      precision: undefined,
      scale: undefined
    });

    parameters.push({
      type: TYPES.NVarChar,
      name: 'stmt',
      value: request.sqlTextOrProcedure,
      output: false,
      length: undefined,
      precision: undefined,
      scale: undefined
    });

    request.preparing = true;

    // TODO: We need to clean up this event handler, otherwise this leaks memory
    request.on('returnValue', (name: string, value: any) => {
      if (name === 'handle') {
        request.handle = value;
      } else {
        request.error = new RequestError(`Tedious > Unexpected output parameter ${name} from sp_prepare`);
      }
    });

    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(Procedures.Sp_Prepare, parameters, this.currentTransactionDescriptor(), this.config.options, this.databaseCollation));
  }

  /**
   * Release the SQL Server resources associated with a previously prepared request.
   *
   * @param request A [[Request]] object representing the request.
   *   Parameters only require a name and type.
   *   Parameter values are ignored.
   */
  unprepare(request: Request) {
    const parameters: Parameter[] = [];

    parameters.push({
      type: TYPES.Int,
      name: 'handle',
      // TODO: Abort if `request.handle` is not set
      value: request.handle,
      output: false,
      length: undefined,
      precision: undefined,
      scale: undefined
    });

    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(Procedures.Sp_Unprepare, parameters, this.currentTransactionDescriptor(), this.config.options, this.databaseCollation));
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
  execute(request: Request, parameters?: { [key: string]: unknown }) {
    const executeParameters: Parameter[] = [];

    executeParameters.push({
      type: TYPES.Int,
      name: '',
      // TODO: Abort if `request.handle` is not set
      value: request.handle,
      output: false,
      length: undefined,
      precision: undefined,
      scale: undefined
    });

    try {
      for (let i = 0, len = request.parameters.length; i < len; i++) {
        const parameter = request.parameters[i];

        executeParameters.push({
          ...parameter,
          value: parameter.type.validate(parameters ? parameters[parameter.name] : null, this.databaseCollation)
        });
      }
    } catch (error: any) {
      request.error = error;

      process.nextTick(() => {
        this.debug.log(error.message);
        request.callback(error);
      });

      return;
    }

    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(Procedures.Sp_Execute, executeParameters, this.currentTransactionDescriptor(), this.config.options, this.databaseCollation));
  }

  /**
   * Call a stored procedure represented by [[Request]].
   *
   * @param request A [[Request]] object representing the request.
   */
  callProcedure(request: Request) {
    try {
      request.validateParameters(this.databaseCollation);
    } catch (error: any) {
      request.error = error;

      process.nextTick(() => {
        this.debug.log(error.message);
        request.callback(error);
      });

      return;
    }

    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request.sqlTextOrProcedure!, request.parameters, this.currentTransactionDescriptor(), this.config.options, this.databaseCollation));
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
  makeRequest(request: Request | BulkLoad, packetType: number, payload: (Iterable<Buffer> | AsyncIterable<Buffer>) & { toString: (indent?: string) => string }) {
    if (this.state !== this.STATE.LOGGED_IN) {
      const message = 'Requests can only be made in the ' + this.STATE.LOGGED_IN.name + ' state, not the ' + this.state.name + ' state';
      this.debug.log(message);
      request.callback(new RequestError(message, 'EINVALIDSTATE'));
    } else if (request.canceled) {
      process.nextTick(() => {
        request.callback(new RequestError('Canceled.', 'ECANCEL'));
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

      const onCancel = () => {
        payloadStream.unpipe(message);
        payloadStream.destroy(new RequestError('Canceled.', 'ECANCEL'));

        // set the ignore bit and end the message.
        message.ignore = true;
        message.end();

        if (request instanceof Request && request.paused) {
          // resume the request if it was paused so we can read the remaining tokens
          request.resume();
        }
      };

      request.once('cancel', onCancel);

      this.createRequestTimer();

      const message = new Message({ type: packetType, resetConnection: this.resetConnectionOnNextRequest });
      this.messageIo.outgoingMessageStream.write(message);
      this.transitionTo(this.STATE.SENT_CLIENT_REQUEST);

      message.once('finish', () => {
        request.removeListener('cancel', onCancel);
        request.once('cancel', this._cancelAfterRequestSent);

        this.resetConnectionOnNextRequest = false;
        this.debug.payload(function() {
          return payload!.toString('  ');
        });
      });

      const payloadStream = Readable.from(payload);
      payloadStream.once('error', (error) => {
        payloadStream.unpipe(message);

        // Only set a request error if no error was set yet.
        request.error ??= error;

        message.ignore = true;
        message.end();
      });
      payloadStream.pipe(message);
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

  /**
   * @private
   */
  async performTlsNegotiation(preloginPayload: PreloginPayload, signal: AbortSignal) {
    signal.throwIfAborted();

    const { promise: signalAborted, reject } = withResolvers<never>();

    const onAbort = () => { reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      if (preloginPayload.fedAuthRequired === 1) {
        this.fedAuthRequired = true;
      }
      if ('strict' !== this.config.options.encrypt && (preloginPayload.encryptionString === 'ON' || preloginPayload.encryptionString === 'REQ')) {
        if (!this.config.options.encrypt) {
          throw new ConnectionError("Server requires encryption, set 'encrypt' config option to true.", 'EENCRYPT');
        }

        this.transitionTo(this.STATE.SENT_TLSSSLNEGOTIATION);
        await Promise.race([
          this.messageIo.startTls(this.secureContextOptions, this.config.options.serverName ? this.config.options.serverName : this.routingData?.server ?? this.config.server, this.config.options.trustServerCertificate).catch((err) => {
            throw this.wrapSocketError(err);
          }),
          signalAborted
        ]);
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  async readPreloginResponse(signal: AbortSignal): Promise<PreloginPayload> {
    signal.throwIfAborted();

    let messageBuffer = Buffer.alloc(0);

    const { promise: signalAborted, reject } = withResolvers<never>();

    const onAbort = () => { reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      const message = await Promise.race([
        this.messageIo.readMessage().catch((err) => {
          throw this.wrapSocketError(err);
        }),
        signalAborted
      ]);

      const iterator = message[Symbol.asyncIterator]();
      try {
        while (true) {
          const { done, value } = await Promise.race([
            iterator.next(),
            signalAborted
          ]);

          if (done) {
            break;
          }

          messageBuffer = Buffer.concat([messageBuffer, value]);
        }
      } finally {
        if (iterator.return) {
          await iterator.return();
        }
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
    }

    const preloginPayload = new PreloginPayload(messageBuffer);
    this.debug.payload(function() {
      return preloginPayload.toString('  ');
    });
    return preloginPayload;
  }

  /**
   * @private
   */
  async performReRouting() {
    this.socket!.removeListener('error', this._onSocketError);
    this.socket!.removeListener('close', this._onSocketClose);
    this.socket!.removeListener('end', this._onSocketEnd);
    this.socket!.destroy();

    this.debug.log('connection to ' + this.config.server + ':' + this.config.options.port + ' closed');

    this.emit('rerouting');
    this.debug.log('Rerouting to ' + this.routingData!.server + ':' + this.routingData!.port);

    // Attempt connecting to the rerouting target
    this.transitionTo(this.STATE.CONNECTING);
    await this.initialiseConnection();
  }

  /**
   * @private
   */
  async performTransientFailureRetry() {
    this.curTransientRetryCount++;

    this.socket!.removeListener('error', this._onSocketError);
    this.socket!.removeListener('close', this._onSocketClose);
    this.socket!.removeListener('end', this._onSocketEnd);
    this.socket!.destroy();

    this.debug.log('connection to ' + this.config.server + ':' + this.config.options.port + ' closed');

    const server = this.routingData ? this.routingData.server : this.config.server;
    const port = this.routingData ? this.routingData.port : this.config.options.port;
    this.debug.log('Retry after transient failure connecting to ' + server + ':' + port);

    const { promise, resolve } = withResolvers<void>();
    setTimeout(resolve, this.config.options.connectionRetryInterval);
    await promise;

    this.emit('retry');
    this.transitionTo(this.STATE.CONNECTING);
    await this.initialiseConnection();
  }

  /**
   * @private
   */
  async performSentLogin7WithStandardLogin(signal: AbortSignal): Promise<RoutingData | undefined> {
    signal.throwIfAborted();

    const { promise: signalAborted, reject } = withResolvers<never>();

    const onAbort = () => { reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      const message = await Promise.race([
        this.messageIo.readMessage().catch((err) => {
          throw this.wrapSocketError(err);
        }),
        signalAborted
      ]);

      const handler = new Login7TokenHandler(this);
      const tokenStreamParser = this.createTokenStreamParser(message, handler);
      await once(tokenStreamParser, 'end');

      if (handler.loginAckReceived) {
        return handler.routingData;
      } else if (this.loginError) {
        throw this.loginError;
      } else {
        throw new ConnectionError('Login failed.', 'ELOGIN');
      }
    } finally {
      this.loginError = undefined;
      signal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * @private
   */
  async performSentLogin7WithNTLMLogin(signal: AbortSignal): Promise<RoutingData | undefined> {
    signal.throwIfAborted();

    const { promise: signalAborted, reject } = withResolvers<never>();

    const onAbort = () => { reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      while (true) {
        const message = await Promise.race([
          this.messageIo.readMessage().catch((err) => {
            throw this.wrapSocketError(err);
          }),
          signalAborted
        ]);

        const handler = new Login7TokenHandler(this);
        const tokenStreamParser = this.createTokenStreamParser(message, handler);
        await Promise.race([
          once(tokenStreamParser, 'end'),
          signalAborted
        ]);

        if (handler.loginAckReceived) {
          return handler.routingData;
        } else if (this.ntlmpacket) {
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
        } else if (this.loginError) {
          throw this.loginError;
        } else {
          throw new ConnectionError('Login failed.', 'ELOGIN');
        }
      }
    } finally {
      this.loginError = undefined;
      signal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * @private
   */
  async performSentLogin7WithFedAuth(signal: AbortSignal): Promise<RoutingData | undefined> {
    signal.throwIfAborted();

    const { promise: signalAborted, reject } = withResolvers<never>();

    const onAbort = () => { reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      const message = await Promise.race([
        this.messageIo.readMessage().catch((err) => {
          throw this.wrapSocketError(err);
        }),
        signalAborted
      ]);

      const handler = new Login7TokenHandler(this);
      const tokenStreamParser = this.createTokenStreamParser(message, handler);
      await Promise.race([
        once(tokenStreamParser, 'end'),
        signalAborted
      ]);

      if (handler.loginAckReceived) {
        return handler.routingData;
      }

      const fedAuthInfoToken = handler.fedAuthInfoToken;

      if (fedAuthInfoToken && fedAuthInfoToken.stsurl && fedAuthInfoToken.spn) {
        /** Federated authentication configation. */
        const authentication = this.config.authentication as TokenCredentialAuthentication | AzureActiveDirectoryPasswordAuthentication | AzureActiveDirectoryMsiVmAuthentication | AzureActiveDirectoryMsiAppServiceAuthentication | AzureActiveDirectoryServicePrincipalSecret | AzureActiveDirectoryDefaultAuthentication;
        /** Permission scope to pass to Entra ID when requesting an authentication token. */
        const tokenScope = new URL('/.default', fedAuthInfoToken.spn).toString();

        /** Instance of the token credential to use to authenticate to the resource. */
        let credentials: TokenCredential;

        switch (authentication.type) {
          case 'token-credential':
            credentials = authentication.options.credential;
            break;
          case 'azure-active-directory-password':
            credentials = new UsernamePasswordCredential(
              authentication.options.tenantId ?? 'common',
              authentication.options.clientId,
              authentication.options.userName,
              authentication.options.password
            );
            break;
          case 'azure-active-directory-msi-vm':
          case 'azure-active-directory-msi-app-service':
            const msiArgs = authentication.options.clientId ? [authentication.options.clientId, {}] : [{}];
            credentials = new ManagedIdentityCredential(...msiArgs);
            break;
          case 'azure-active-directory-default':
            const args = authentication.options.clientId ? { managedIdentityClientId: authentication.options.clientId } : {};
            credentials = new DefaultAzureCredential(args);
            break;
          case 'azure-active-directory-service-principal-secret':
            credentials = new ClientSecretCredential(
              authentication.options.tenantId,
              authentication.options.clientId,
              authentication.options.clientSecret
            );
            break;
        }

        /** Access token retrieved from Entra ID for the configured permission scope(s). */
        let tokenResponse: AccessToken | null;

        try {
          tokenResponse = await Promise.race([
            credentials.getToken(tokenScope),
            signalAborted
          ]);
        } catch (err) {
          signal.throwIfAborted();

          throw new AggregateError(
            [new ConnectionError('Security token could not be authenticated or authorized.', 'EFEDAUTH'), err]);
        }

        // Type guard the token value so that it is never null.
        if (tokenResponse === null) {
          throw new AggregateError(
            [new ConnectionError('Security token could not be authenticated or authorized.', 'EFEDAUTH')]);
        }

        this.sendFedAuthTokenMessage(tokenResponse.token);
        // sent the fedAuth token message, the rest is similar to standard login 7
        this.transitionTo(this.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
        return await this.performSentLogin7WithStandardLogin(signal);
      } else if (this.loginError) {
        throw this.loginError;
      } else {
        throw new ConnectionError('Login failed.', 'ELOGIN');
      }
    } finally {
      this.loginError = undefined;
      signal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * @private
   */
  async performLoggedInSendingInitialSql(signal: AbortSignal) {
    signal.throwIfAborted();

    const { promise: signalAborted, reject } = withResolvers<never>();

    const onAbort = () => { reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      this.sendInitialSql();

      const message = await Promise.race([
        this.messageIo.readMessage().catch((err) => {
          throw this.wrapSocketError(err);
        }),
        signalAborted
      ]);

      const tokenStreamParser = this.createTokenStreamParser(message, new InitialSqlTokenHandler(this));
      await Promise.race([
        once(tokenStreamParser, 'end'),
        signalAborted
      ]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

function isTransientError(error: AggregateError | ConnectionError): boolean {
  if (error instanceof AggregateError) {
    error = error.errors[0];
  }
  return (error instanceof ConnectionError) && !!error.isTransient;
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
    events: {}
  },
  SENT_PRELOGIN: {
    name: 'SentPrelogin',
    events: {}
  },
  REROUTING: {
    name: 'ReRouting',
    events: {}
  },
  TRANSIENT_FAILURE_RETRY: {
    name: 'TRANSIENT_FAILURE_RETRY',
    events: {}
  },
  SENT_TLSSSLNEGOTIATION: {
    name: 'SentTLSSSLNegotiation',
    events: {}
  },
  SENT_LOGIN7_WITH_STANDARD_LOGIN: {
    name: 'SentLogin7WithStandardLogin',
    events: {}
  },
  SENT_LOGIN7_WITH_NTLM: {
    name: 'SentLogin7WithNTLMLogin',
    events: {}
  },
  SENT_LOGIN7_WITH_FEDAUTH: {
    name: 'SentLogin7WithFedauth',
    events: {}
  },
  LOGGED_IN_SENDING_INITIAL_SQL: {
    name: 'LoggedInSendingInitialSql',
    events: {}
  },
  LOGGED_IN: {
    name: 'LoggedIn',
    events: {
      socketError: function() {
        this.transitionTo(this.STATE.FINAL);
        this.cleanupConnection();
      }
    }
  },
  SENT_CLIENT_REQUEST: {
    name: 'SentClientRequest',
    enter: function() {
      (async () => {
        let message;
        try {
          message = await this.messageIo.readMessage();
        } catch (err: any) {
          this.dispatchEvent('socketError', err);
          process.nextTick(() => {
            this.emit('error', this.wrapSocketError(err));
          });
          return;
        }
        // request timer is stopped on first data package
        this.clearRequestTimer();

        const tokenStreamParser = this.createTokenStreamParser(message, new RequestTokenHandler(this, this.request!));

        // If the request was canceled and we have a `cancelTimer`
        // defined, we send a attention message after the
        // request message was fully sent off.
        //
        // We already started consuming the current message
        // (but all the token handlers should be no-ops), and
        // need to ensure the next message is handled by the
        // `SENT_ATTENTION` state.
        if (this.request?.canceled && this.cancelTimer) {
          return this.transitionTo(this.STATE.SENT_ATTENTION);
        }

        const onResume = () => {
          tokenStreamParser.resume();
        };
        const onPause = () => {
          tokenStreamParser.pause();

          this.request?.once('resume', onResume);
        };

        this.request?.on('pause', onPause);

        if (this.request instanceof Request && this.request.paused) {
          onPause();
        }

        const onCancel = () => {
          tokenStreamParser.removeListener('end', onEndOfMessage);

          if (this.request instanceof Request && this.request.paused) {
            // resume the request if it was paused so we can read the remaining tokens
            this.request.resume();
          }

          this.request?.removeListener('pause', onPause);
          this.request?.removeListener('resume', onResume);

          // The `_cancelAfterRequestSent` callback will have sent a
          // attention message, so now we need to also switch to
          // the `SENT_ATTENTION` state to make sure the attention ack
          // message is processed correctly.
          this.transitionTo(this.STATE.SENT_ATTENTION);
        };

        const onEndOfMessage = () => {
          this.request?.removeListener('cancel', this._cancelAfterRequestSent);
          this.request?.removeListener('cancel', onCancel);
          this.request?.removeListener('pause', onPause);
          this.request?.removeListener('resume', onResume);

          this.transitionTo(this.STATE.LOGGED_IN);
          const sqlRequest = this.request as Request;
          this.request = undefined;
          if (this.config.options.tdsVersion < '7_2' && sqlRequest.error && this.isSqlBatch) {
            this.inTransaction = false;
          }
          sqlRequest.callback(sqlRequest.error, sqlRequest.rowCount, sqlRequest.rows);
        };

        tokenStreamParser.once('end', onEndOfMessage);
        this.request?.once('cancel', onCancel);
      })();

    },
    exit: function(nextState) {
      this.clearRequestTimer();
    },
    events: {
      socketError: function(err) {
        const sqlRequest = this.request!;
        this.request = undefined;
        this.transitionTo(this.STATE.FINAL);
        this.cleanupConnection();

        sqlRequest.callback(err);
      }
    }
  },
  SENT_ATTENTION: {
    name: 'SentAttention',
    enter: function() {
      (async () => {
        let message;
        try {
          message = await this.messageIo.readMessage();
        } catch (err: any) {
          this.dispatchEvent('socketError', err);
          process.nextTick(() => {
            this.emit('error', this.wrapSocketError(err));
          });
          return;
        }

        const handler = new AttentionTokenHandler(this, this.request!);
        const tokenStreamParser = this.createTokenStreamParser(message, handler);

        await once(tokenStreamParser, 'end');
        // 3.2.5.7 Sent Attention State
        // Discard any data contained in the response, until we receive the attention response
        if (handler.attentionReceived) {
          this.clearCancelTimer();

          const sqlRequest = this.request!;
          this.request = undefined;
          this.transitionTo(this.STATE.LOGGED_IN);

          if (sqlRequest.error && sqlRequest.error instanceof RequestError && sqlRequest.error.code === 'ETIMEOUT') {
            sqlRequest.callback(sqlRequest.error);
          } else {
            sqlRequest.callback(new RequestError('Canceled.', 'ECANCEL'));
          }
        }
      })().catch((err) => {
        process.nextTick(() => {
          throw err;
        });
      });
    },
    events: {
      socketError: function(err) {
        const sqlRequest = this.request!;
        this.request = undefined;

        this.transitionTo(this.STATE.FINAL);
        this.cleanupConnection();

        sqlRequest.callback(err);
      }
    }
  },
  FINAL: {
    name: 'Final',
    events: {}
  }
};
