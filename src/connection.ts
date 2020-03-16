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

import depd from 'depd';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const deprecate = depd('tedious');

// A rather basic state machine for managing a connection.
// Implements something approximating s3.2.1.

const KEEP_ALIVE_INITIAL_DELAY = 30 * 1000;
const DEFAULT_CONNECT_TIMEOUT = 15 * 1000;
const DEFAULT_CLIENT_REQUEST_TIMEOUT = 15 * 1000;
const DEFAULT_CANCEL_TIMEOUT = 5 * 1000;
const DEFAULT_CONNECT_RETRY_INTERVAL = 500;
const DEFAULT_PACKET_SIZE = 4 * 1024;
const DEFAULT_TEXTSIZE = '2147483647';
const DEFAULT_DATEFIRST = 7;
const DEFAULT_PORT = 1433;
const DEFAULT_TDS_VERSION = '7_4';
const DEFAULT_LANGUAGE = 'us_english';
const DEFAULT_DATEFORMAT = 'mdy';

interface AzureActiveDirectoryMsiAppServiceAuthentication {
  type: 'azure-active-directory-msi-app-service';
  options: {
    clientId?: string;
    msiEndpoint?: string;
    msiSecret?: string;
  };
}

interface AzureActiveDirectoryMsiVmAuthentication {
  type: 'azure-active-directory-msi-vm';
  options: {
    clientId?: string;
    msiEndpoint?: string;
  };
}

interface AzureActiveDirectoryAccessTokenAuthentication {
  type: 'azure-active-directory-access-token';
  options: {
    token: string;
  };
}

interface AzureActiveDirectoryPasswordAuthentication {
  type: 'azure-active-directory-password';
  options: {
    userName: string;
    password: string;
  };
}

interface AzureActiveDirectoryServicePrincipalSecret {
  type: 'azure-active-directory-service-principal-secret';
  options: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
  };
}

interface NtlmAuthentication {
  type: 'ntlm';
  options: {
    userName: string;
    password: string;
    domain: string;
  };
}

interface DefaultAuthentication {
  type: 'default';
  options: {
    userName?: string;
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
  columnNameReplacer: undefined| ((colName: string, index: number, metadata: Metadata) => string);
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
  tdsVersion: string;
  textsize: string;
  trustServerCertificate: boolean;
  useColumnNames: boolean;
  useUTC: boolean;
  lowerCaseGuids: boolean;
}

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

export interface ConnectionConfiguration {
  server: string;
  options?: ConnectionOptions;
  authentication?: {
    type?: string;
    options?: any;
  };
}

interface ConnectionOptions {
  abortTransactionOnError?: boolean;
  appName?: string | undefined;
  camelCaseColumns?: boolean;
  cancelTimeout?: number;
  columnNameReplacer?: (colName: string, index: number, metadata: Metadata) => string;
  connectionRetryInterval?: number;
  connectTimeout?: number;
  connectionIsolationLevel?: number;
  cryptoCredentialsDetails?: {};
  database?: string | undefined;
  datefirst?: number;
  dateFormat?: string;
  debug?: {
    data: boolean;
    packet: boolean;
    payload: boolean;
    token: boolean;
  };
  enableAnsiNull?: boolean;
  enableAnsiNullDefault?: boolean;
  enableAnsiPadding?: boolean;
  enableAnsiWarnings?: boolean;
  enableArithAbort?: boolean;
  enableConcatNullYieldsNull?: boolean;
  enableCursorCloseOnCommit?: boolean | null;
  enableImplicitTransactions?: boolean;
  enableNumericRoundabort?: boolean;
  enableQuotedIdentifier?: boolean;
  encrypt?: boolean;
  fallbackToDefaultDb?: boolean;
  instanceName?: string | undefined;
  isolationLevel?: number;
  language?: string;
  localAddress?: string | undefined;
  maxRetriesOnTransientErrors?: number;
  multiSubnetFailover?: boolean;
  packetSize?: number;
  port?: number;
  readOnlyIntent?: boolean;
  requestTimeout?: number;
  rowCollectionOnDone?: boolean;
  rowCollectionOnRequestCompletion?: boolean;
  tdsVersion?: string;
  textsize?: string;
  trustServerCertificate?: boolean;
  useColumnNames?: boolean;
  useUTC?: boolean;
  lowerCaseGuids?: boolean;
}

const CLEANUP_TYPE = {
  NORMAL: 0,
  REDIRECT: 1,
  RETRY: 2
};

class Connection extends EventEmitter {
  fedAuthRequired: boolean;
  fedAuthInfoToken: undefined | FedAuthInfoToken;
  config: InternalConnectionConfig;
  secureContext: SecureContext;
  inTransaction: boolean;
  transactionDescriptors: Buffer[];
  transactionDepth: number;
  isSqlBatch: boolean;
  curTransientRetryCount: number;
  transientErrorLookup: TransientErrorLookup;
  closed: boolean;
  loggedIn: boolean;
  loginError: undefined | ConnectionError;
  debug: Debug;
  tokenStreamParser: TokenStreamParser;
  ntlmpacket: undefined | any;
  ntlmpacketBuffer: undefined | Buffer;

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

  routingData: any;
  messageIo!: MessageIO;
  state: State;
  resetConnectionOnNextRequest: undefined | boolean;
  attentionReceived: undefined | boolean;

  request: undefined | Request | BulkLoad;
  procReturnStatusValue: undefined | any;
  socket: undefined | Socket;
  messageBuffer: Buffer;

  connectTimer: undefined | NodeJS.Timeout;
  cancelTimer: undefined | NodeJS.Timeout;
  requestTimer: undefined | NodeJS.Timeout;
  retryTimer: undefined | NodeJS.Timeout;

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
        tdsVersion: DEFAULT_TDS_VERSION,
        textsize: DEFAULT_TEXTSIZE,
        trustServerCertificate: true,
        useColumnNames: false,
        useUTC: true,
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
      } else {
        deprecate('The default value for `config.options.trustServerCertificate` will change from `true` to `false` in the next major version of `tedious`. Set the value to `true` or `false` explicitly to silence this message.');
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

      if (config.options.lowerCaseGuids !== undefined) {
        if (typeof config.options.lowerCaseGuids !== 'boolean') {
          throw new TypeError('The "config.options.lowerCaseGuids" property must be of type boolean.');
        }

        this.config.options.lowerCaseGuids = config.options.lowerCaseGuids;
      }
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
      this.once('connect', connectListener);
    }

    this.transitionTo(this.STATE.CONNECTING);
  }

  close() {
    this.transitionTo(this.STATE.FINAL);
  }

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

  createDebug() {
    const debug = new Debug(this.config.options.debug);
    debug.on('debug', (message) => {
      this.emit('debug', message);
    });
    return debug;
  }

  createTokenStreamParser() {
    const tokenStreamParser = new TokenStreamParser(this.debug, undefined, this.config.options);

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
      if (this.state === this.STATE.SENT_CLIENT_REQUEST) {
        this.dispatchEvent('endOfMessageMarkerReceived');
      }
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

      this.socket = socket;
      this.socketConnect();
    });
  }

  closeConnection() {
    if (this.socket) {
      this.socket.destroy();
    }
  }

  createConnectTimer() {
    this.connectTimer = setTimeout(() => {
      this.connectTimeout();
    }, this.config.options.connectTimeout);
  }

  createCancelTimer() {
    this.clearCancelTimer();
    const timeout = this.config.options.cancelTimeout;
    if (timeout > 0) {
      this.cancelTimer = setTimeout(() => {
        this.cancelTimeout();
      }, timeout);
    }
  }

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

  createRetryTimer() {
    this.clearRetryTimer();
    this.retryTimer = setTimeout(() => {
      this.retryTimeout();
    }, this.config.options.connectionRetryInterval);
  }

  connectTimeout() {
    const message = `Failed to connect to ${this.config.server}${this.config.options.port ? `:${this.config.options.port}` : `\\${this.config.options.instanceName}`} in ${this.config.options.connectTimeout}ms`;
    this.debug.log(message);
    this.emit('connect', ConnectionError(message, 'ETIMEOUT'));
    this.connectTimer = undefined;
    this.dispatchEvent('connectTimeout');
  }

  cancelTimeout() {
    const message = `Failed to cancel request in ${this.config.options.cancelTimeout}ms`;
    this.debug.log(message);
    this.dispatchEvent('socketError', ConnectionError(message, 'ETIMEOUT'));
  }

  requestTimeout() {
    this.requestTimer = undefined;
    const request = this.request!;
    request.cancel();
    const timeout = (request.timeout !== undefined) ? request.timeout : this.config.options.requestTimeout;
    const message = 'Timeout: Request failed to complete in ' + timeout + 'ms';
    request.error = RequestError(message, 'ETIMEOUT');
  }

  retryTimeout() {
    this.retryTimer = undefined;
    this.emit('retry');
    this.transitionTo(this.STATE.CONNECTING);
  }

  clearConnectTimer() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
    }
  }

  clearCancelTimer() {
    if (this.cancelTimer) {
      clearTimeout(this.cancelTimer);
    }
  }

  clearRequestTimer() {
    if (this.requestTimer) {
      clearTimeout(this.requestTimer);
      this.requestTimer = undefined;
    }
  }

  clearRetryTimer() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

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

  getEventHandler<T extends keyof State['events']>(eventName: T): NonNullable<State['events'][T]> {
    const handler = this.state.events[eventName];

    if (!handler) {
      throw new Error(`No event '${eventName}' in state '${this.state.name}'`);
    }

    return handler!;
  }

  dispatchEvent<T extends keyof State['events']>(eventName: T, ...args: Parameters<NonNullable<State['events'][T]>>) {
    const handler = this.state.events[eventName] as Function | undefined;
    if (handler) {
      handler.apply(this, args);
    } else {
      this.emit('error', new Error(`No event '${eventName}' in state '${this.state.name}'`));
      this.close();
    }
  }

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

  socketConnect() {
    this.closed = false;
    this.debug.log('connected to ' + this.config.server + ':' + this.config.options.port);
    this.dispatchEvent('socketConnect');
  }

  socketEnd() {
    this.debug.log('socket ended');
    if (this.state !== this.STATE.FINAL) {
      const error: ErrorWithCode = new Error('socket hang up');
      error.code = 'ECONNRESET';
      this.socketError(error);
    }
  }

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

  sendPreLogin() {
    const payload = new PreloginPayload({
      encrypt: this.config.options.encrypt
    });
    this.messageIo.sendMessage(TYPE.PRELOGIN, payload.data);
    this.debug.payload(function() {
      return payload.toString('  ');
    });
  }

  emptyMessageBuffer() {
    this.messageBuffer = Buffer.alloc(0);
  }

  addToMessageBuffer(data: Buffer) {
    this.messageBuffer = Buffer.concat([this.messageBuffer, data]);
  }

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

    payload.hostname = os.hostname();
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

  // Returns false to apply backpressure.
  sendDataToTokenStreamParser(data: Buffer) {
    return this.tokenStreamParser.addBuffer(data);
  }

  // This is an internal method that is called from Request.pause().
  // It has to check whether the passed Request object represents the currently
  // active request, because the application might have called Request.pause()
  // on an old inactive Request object.
  pauseRequest(request: Request | BulkLoad) {
    if (this.isRequestActive(request)) {
      this.tokenStreamParser.pause();
    }
  }

  // This is an internal method that is called from Request.resume().
  resumeRequest(request: Request | BulkLoad) {
    if (this.isRequestActive(request)) {
      this.tokenStreamParser.resume();
    }
  }

  // Returns true if the passed request is the currently active request of the connection.
  isRequestActive(request: Request | BulkLoad) {
    return request === this.request && this.state === this.STATE.SENT_CLIENT_REQUEST;
  }

  sendInitialSql() {
    const payload = new SqlBatchPayload(this.getInitialSql(), this.currentTransactionDescriptor(), this.config.options);

    const message = new Message({ type: TYPE.SQL_BATCH });
    this.messageIo.outgoingMessageStream.write(message);
    Readable.from(payload).pipe(message);
  }

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

  processedInitialSql() {
    this.clearConnectTimer();
    this.emit('connect');
  }

  execSqlBatch(request: Request) {
    this.makeRequest(request, TYPE.SQL_BATCH, new SqlBatchPayload(request.sqlTextOrProcedure!, this.currentTransactionDescriptor(), this.config.options));
  }

  execSql(request: Request) {
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

  /**
   @function newBulkLoad
   @param {string} table - Table's name.
   @param {Object} [options] - BulkLoad options.
   @param {boolean} [options.checkConstraints=false] - Honors constraints during bulk load, it is disabled by default.
   @param {boolean} [options.fireTriggers=false] - Honors insert triggers during bulk load, it is disabled by default.
   @param {boolean} [options.keepNulls=false] - Honors null value passed, ignores the default values set on table.
   @param {boolean} [options.tableLock=false] - Places a bulk update(BU) lock on table while performing bulk load. Uses row locks by default.
   @param {callback} callback - Function to call after BulkLoad executes.
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

  prepare(request: Request) {
    request.transformIntoPrepareRpc();
    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  unprepare(request: Request) {
    request.transformIntoUnprepareRpc();
    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

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

  beginTransaction(callback: (err: Error | null | undefined, transactionDescriptor?: Buffer) => void, name = '', isolationLevel = this.config.options.isolationLevel) {
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

  commitTransaction(callback: (err: Error | null | undefined) => void, name = '') {
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

  rollbackTransaction(callback: (err: Error | null | undefined) => void, name = '') {
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

  saveTransaction(callback: (err: Error | null | undefined) => void, name: string) {
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

  // eslint-disable-next-line space-before-function-paren
  transaction<T extends (...args: any[]) => void>(cb: (err: Error | null | undefined, txDone?: (err: Error | null | undefined, done: T, ...args: Parameters<T>) => void) => void, isolationLevel?: typeof ISOLATION_LEVEL[keyof typeof ISOLATION_LEVEL]) {
    if (isolationLevel) {
      assertValidIsolationLevel(isolationLevel, 'isolationLevel');
    }

    if (typeof cb !== 'function') {
      throw new TypeError('`cb` must be a function');
    }

    const useSavepoint = this.inTransaction;
    const name = '_tedious_' + (crypto.randomBytes(10).toString('hex'));
    const txDone: (err: Error | null | undefined, done: T, ...args: Parameters<T>) => void = (err, done, ...args) => {
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
      request.connection = this;
      request.rowCount = 0;
      request.rows = [];
      request.rst = [];

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

        if (request.paused) { // Request.pause() has been called before the request was started
          this.pauseRequest(request);
        }
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

  reset(callback: (err: Error | undefined | null) => void) {
    const request = new Request(this.getInitialSql(), (err) => {
      if (this.config.options.tdsVersion < '7_2') {
        this.inTransaction = false;
      }
      callback(err);
    });
    this.resetConnectionOnNextRequest = true;
    this.execSqlBatch(request);
  }

  currentTransactionDescriptor() {
    return this.transactionDescriptors[this.transactionDescriptors.length - 1];
  }

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

          this.messageIo.startTls(this.secureContext, this.config.server, this.config.options.trustServerCertificate);
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
      message: function() {
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
