// @flow

const deprecate = require('depd')('tedious');

const crypto = require('crypto');
const os = require('os');
// $FlowFixMe
const constants = require('constants');
const { createSecureContext } = require('tls');

const { AuthenticationContext } = require('adal-node');

const BulkLoad = require('./bulk-load');
const Debug = require('./debug');
const EventEmitter = require('events').EventEmitter;
const InstanceLookup = require('./instance-lookup').InstanceLookup;
const TransientErrorLookup = require('./transient-error-lookup.js').TransientErrorLookup;
const TYPE = require('./packet').TYPE;
const PreloginPayload = require('./prelogin-payload');
const Login7Payload = require('./login7-payload');
const NTLMResponsePayload = require('./ntlm-payload');
const Request = require('./request');
const RpcRequestPayload = require('./rpcrequest-payload');
const SqlBatchPayload = require('./sqlbatch-payload');
const MessageIO = require('./message-io');
const TokenStreamParser = require('./token/token-stream-parser').Parser;
const Transaction = require('./transaction').Transaction;
const ISOLATION_LEVEL = require('./transaction').ISOLATION_LEVEL;
const ConnectionError = require('./errors').ConnectionError;
const RequestError = require('./errors').RequestError;
const Connector = require('./connector').Connector;
const libraryName = require('./library').name;
const versions = require('./tds-versions').versions;

const { createNTLMRequest } = require('./ntlm');

import type { CompletionCallback as RequestCompletionCallback } from './request';
import type { Socket } from 'net';

/* global $Values, $PropertyType, TimeoutID */

// A rather basic state machine for managing a connection.
// Implements something approximating s3.2.1.

const KEEP_ALIVE_INITIAL_DELAY = 30 * 1000;
const DEFAULT_CONNECT_TIMEOUT = 15 * 1000;
const DEFAULT_CLIENT_REQUEST_TIMEOUT = 15 * 1000;
const DEFAULT_CANCEL_TIMEOUT = 5 * 1000;
const DEFAULT_CONNECT_RETRY_INTERVAL = 500;
const DEFAULT_PACKET_SIZE = 4 * 1024;
const DEFAULT_TEXTSIZE = 2147483647;
const DEFAULT_DATEFIRST = 7;
const DEFAULT_PORT = 1433;
const DEFAULT_TDS_VERSION = '7_4';
const DEFAULT_LANGUAGE = 'us_english';
const DEFAULT_DATEFORMAT = 'mdy';

type InternalConfig = {
  server: string,

  authentication: {
    type: 'default',
    options: {
      userName: string,
      password: string
    }
  } | {
    type: 'ntlm',
    options: {
      userName: string,
      password: string,
      domain: string
    }
  } | {
    type: 'azure-active-directory-password',
    options: {
      userName: string,
      password: string
    }
  };

  options: InternalConfigOptions
};

type InternalConfigOptions = {
  appName: string | void,
  abortTransactionOnError: boolean | null,
  connectionIsolationLevel: boolean | null,
  textsize: number | null,
  enableQuotedIdentifier: boolean | null,
  enableNumericRoundabort: boolean | null,
  language: string | null,
  dateFormat: string | null,
  datefirst: number | null,
  enableImplicitTransactions: boolean | null,
  enableCursorCloseOnCommit: boolean | null,
  enableArithAbort: boolean | null,
  enableConcatNullYieldsNull: boolean | null,
  enableAnsiWarnings: boolean | null,
  enableAnsiPadding: boolean | null,
  enableAnsiNullDefault: boolean | null,
  enableAnsiNull: boolean | null,
  fallbackToDefaultDb: boolean,
  readOnlyIntent: boolean,
  database: string | void,
  tdsVersion: string,
  isolationLevel: $Values<ISOLATION_LEVEL>,
  packetSize: number,
  encrypt: boolean,
  port: number,
  requestTimeout: number,
  cancelTimeout: number,
  connectTimeout: number,
  instanceName: string | void,
  connectionRetryInterval: number,
  multiSubnetFailover: boolean,
  localAddress: string | void,
  rowCollectionOnDone: boolean,
  rowCollectionOnRequestCompletion: boolean,
  useColumnNames: boolean,
  maxRetriesOnTransientErrors: number,
  debug: DebugOptions,
  useUTC: boolean,
  cryptoCredentialsDetails: { secureOptions?: number },
  trustServerCertificate: boolean,
  columnNameReplacer: Function | void,
  camelCaseColumns: boolean
};

type DebugOptions = {
  data: boolean | void,
  packet: boolean | void,
  payload: boolean | void,
  token: boolean | void
};

/**
  A <code>Connection</code> instance represents a single connection to a database server.

  Only one request at a time may be executed on a connection.

  Once a <a href="api-request.html"><code>Request</code></a> has been initiated
  (with <a href="#function_callProcedure"><code>callProcedure</code></a>,
  <a href="#function_execSql"><code>execSql</code></a>, or
  <a href="#function_execSqlBatch"><code>execSqlBatch</code></a>),
  another should not be initiated until the <code>Request</code>'s completion callback is called.

  @example
    var Connection = require('tedious').Connection;
    var config = {...};
    var connection = new Connection(config);

  @param {Object} config
  @param {string} config.server
    Hostname to connect to.

  @param {Object?} config.authentication
  @param {string?} [config.authentication.type='default']
    Type of the authentication method, valid types are `default`, `ntlm`, `azure-active-directory-password`
  @param {Object?} config.authentication.options
    Authentication type specific options.
  @param {string?} [config.authentication.options.userName='']
    User name to use for authentication.
  @param {string?} [config.authentication.options.password='']
    Password to use for authentication.
  @param {string?} config.authentication.options.domain
    Domain to use for authentication. Only supported with the `ntlm` authentication type.

  @param {Object?} config.options
  @param {number?} [config.options.port=1433]
    Port to connect to.

    Mutually exclusive with `options.instanceName`.
  @param {string?} config.options.instanceName
    The instance name to connect to.
    The SQL Server Browser service must be running on the database server,
    and UDP port 1434 on the database server must be reachable.

    (no default)

    Mutually exclusive with `options.port`.
  @param {string?} config.options.database
    Database to connect to (default: dependent on server configuration).
  @param {boolean?} [config.options.fallbackToDefaultDb=false]
    By default, if the database requested by <code>options.database</code> cannot be accessed,
    the connection will fail with an error. However, if <code>options.fallbackToDefaultDb</code> is
    set to <code>true</code>, then the user's default database will be used instead.

*/
class Connection extends EventEmitter {
  fedAuthRequired: boolean;
  fedAuthInfoToken: { stsurl?: string, spn?: string } | void;

  config: InternalConfig;

  secureContext: any;

  isSqlBatch: boolean;

  curTransientRetryCount: number;

  inTransaction: boolean;
  transactionDepth: number;
  transactionDescriptors: Array<Buffer>;

  transientErrorLookup: TransientErrorLookup;

  cleanupTypeEnum: {
    NORMAL: 0,
    REDIRECT: 1,
    RETRY: 2
  };

  tokenStreamParser: TokenStreamParser;

  request: Request | BulkLoad | void;
  messageIo: MessageIO;

  routingData: { server: string, port: number } | void;

  socket: Socket;

  state: $Values<$PropertyType<Connection, 'STATE'>>;
  STATE: {
    [key: 'CONNECTING' | 'FINAL' | 'LOGGED_IN' | 'LOGGED_IN_SENDING_INITIAL_SQL' | 'REROUTING' | 'SENT_ATTENTION' | 'SENT_CLIENT_REQUEST' | 'SENT_LOGIN7_WITH_FEDAUTH' | 'SENT_LOGIN7_WITH_NTLM' | 'SENT_LOGIN7_WITH_STANDARD_LOGIN' | 'SENT_PRELOGIN' | 'SENT_TLSSSLNEGOTIATION' | 'TRANSIENT_FAILURE_RETRY']: {
      name: string,
      enter?: () => void,
      exit?: () => void,
      events: {
        loginFailed?: () => void,
        connectTimeout?: () => void,
        message?: () => void,
        socketError?: (ConnectionError) => void,
        data?: (data: Buffer) => void
      }
    }
  };

  debug: Debug;

  cancelTimer: TimeoutID | void;
  retryTimer: TimeoutID | void;
  requestTimer: TimeoutID | void;
  connectTimer: TimeoutID | void;

  procReturnStatusValue: mixed;
  ntlmpacket: any | void;
  ntlmpacketBuffer: Buffer | void;

  closed: boolean;
  loggedIn: boolean;
  loginError: ConnectionError | void;
  resetConnectionOnNextRequest: boolean;

  messageBuffer: Buffer;

  constructor(config: any) {
    super();

    if (typeof config !== 'object' || config === null) {
      throw new TypeError('The "config" argument is required and must be of type Object.');
    }

    if (typeof config.server !== 'string') {
      throw new TypeError('The "config.server" property is required and must be of type string.');
    }

    this.fedAuthRequired = false;
    this.fedAuthInfoToken = undefined;

    let authentication;
    if (config.authentication !== undefined) {
      if (typeof config.authentication !== 'object' || config.authentication === null) {
        throw new TypeError('The "config.authentication" property must be of type Object.');
      }

      if (typeof config.authentication.type !== 'string') {
        throw new TypeError('The "config.authentication.type" property must be of type string.');
      }

      if (config.authentication.type !== 'default' && config.authentication.type !== 'ntlm' && config.authentication.type !== 'azure-active-directory-password') {
        throw new TypeError('The "config.authentication.type" property must one of "default", "ntlm" or "azure-active-directory-password".');
      }

      if (config.authentication.options !== undefined) {
        if (typeof config.authentication.options !== 'object' || config.authentication.options === null) {
          throw new TypeError('The "config.authentication.options" property must be of type object.');
        }

        if (config.authentication.type === 'ntlm') {
          if (typeof config.authentication.options.domain !== 'string') {
            throw new TypeError('The "config.authentication.options.domain" property must be of type string.');
          }
        }

        if (config.authentication.options.userName !== undefined && typeof config.authentication.options.userName !== 'string') {
          throw new TypeError('The "config.authentication.options.userName" property must be of type string.');
        }

        if (config.authentication.options.password !== undefined && typeof config.authentication.options.password !== 'string') {
          throw new TypeError('The "config.authentication.options.password" property must be of type string.');
        }
      }

      if (config.authentication.type === 'ntlm') {
        authentication = {
          type: 'ntlm',
          options: {
            userName: config.authentication.options.userName,
            password: config.authentication.options.password,
            domain: config.authentication.options.domain && config.authentication.options.domain.toUpperCase()
          }
        };
      } else if (config.authentication.type === 'azure-active-directory-password') {
        authentication = {
          type: 'azure-active-directory-password',
          options: {
            userName: config.authentication.options.userName,
            password: config.authentication.options.password,
          }
        };
      } else {
        authentication = {
          type: 'default',
          options: {
            userName: config.authentication.options.userName,
            password: config.authentication.options.password
          }
        };
      }
    } else {
      if (config.domain !== undefined) {
        if (typeof config.domain !== 'string') {
          throw new TypeError('The "config.domain" property must be of type string.');
        }

        deprecate('The "config.domain" property is deprecated and future tedious versions will no longer support it. Please switch to using the new "config.authentication" property instead.');
      }

      if (config.userName !== undefined) {
        if (typeof config.userName !== 'string') {
          throw new TypeError('The "config.userName" property must be of type string.');
        }

        deprecate('The "config.userName" property is deprecated and future tedious versions will no longer support it. Please switch to using the new "config.authentication" property instead.');
      }

      if (config.password !== undefined) {
        if (typeof config.password !== 'string') {
          throw new TypeError('The "config.password" property must be of type string.');
        }

        deprecate('The "config.password" property is deprecated and future tedious versions will no longer support it. Please switch to using the new "config.authentication" property instead.');
      }

      if (config.domain) {
        authentication = {
          type: 'ntlm',
          options: {
            userName: config.userName,
            password: config.password,
            domain: config.domain && config.domain.toUpperCase()
          }
        };
      } else {
        authentication = {
          type: 'default',
          options: {
            userName: config.userName,
            password: config.password
          }
        };
      }
    }

    this.config = {
      server: config.server,
      authentication: authentication,
      options: ({
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
        enableArithAbort: false,
        enableConcatNullYieldsNull: true,
        enableCursorCloseOnCommit: null,
        enableImplicitTransactions: false,
        enableNumericRoundabort: false,
        enableQuotedIdentifier: true,
        encrypt: false,
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
        useUTC: true
      }: InternalConfigOptions)
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
      } else {
        deprecate('The default value for `options.encrypt` will change from `false` to `true`. Please pass `false` explicitly if you want to retain current behaviour.');
        this.config.options.encrypt = false;
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
      }

      if (config.options.isolationLevel !== undefined) {
        if (typeof config.options.isolationLevel !== 'number') {
          throw new TypeError('The "config.options.language" property must be of type numer.');
        }

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

    this.createDebug();
    this.createTokenStreamParser();
    this.inTransaction = false;
    this.transactionDescriptors = [Buffer.from([0, 0, 0, 0, 0, 0, 0, 0])];
    this.transitionTo(this.STATE.CONNECTING);

    if (this.config.options.tdsVersion < '7_2') {
      // 'beginTransaction', 'commitTransaction' and 'rollbackTransaction'
      // events are utilized to maintain inTransaction property state which in
      // turn is used in managing transactions. These events are only fired for
      // TDS version 7.2 and beyond. The properties below are used to emulate
      // equivalent behavior for TDS versions before 7.2.
      this.transactionDepth = 0;
      this.isSqlBatch = false;
    }

    this.curTransientRetryCount = 0;
    this.transientErrorLookup = new TransientErrorLookup();

    this.cleanupTypeEnum = {
      NORMAL: 0,
      REDIRECT: 1,
      RETRY: 2
    };
  }

  /**
    Closes the connection to the database.

    The <a href="#event_end"><code>end</code></a> will be emitted once the connection has been closed.
  */
  close() {
    this.transitionTo(this.STATE.FINAL);
  }

  initialiseConnection() {
    this.connect();
    this.createConnectTimer();
  }

  cleanupConnection(cleanupTypeEnum: $Values<$PropertyType<Connection, 'cleanupTypeEnum'>>) {
    if (!this.closed) {
      this.clearConnectTimer();
      this.clearRequestTimer();
      this.clearRetryTimer();
      this.closeConnection();
      if (cleanupTypeEnum === this.cleanupTypeEnum.REDIRECT) {
        this.emit('rerouting');
      } else if (cleanupTypeEnum !== this.cleanupTypeEnum.RETRY) {
        process.nextTick(() => {
          this.emit('end');
        });
      }
      const request = this.request;
      if (request) {
        const err = new RequestError('Connection closed before request completed.', 'ECLOSE');
        request.callback(err);
        this.request = undefined;
      }
      this.closed = true;
      this.loggedIn = false;
      this.loginError = undefined;
    }
  }

  createDebug() {
    this.debug = new Debug(this.config.options.debug);
    this.debug.on('debug', (message) => {
      this.emit('debug', message);
    });
  }

  createTokenStreamParser() {
    this.tokenStreamParser = new TokenStreamParser(this.debug, undefined, this.config.options);

    this.tokenStreamParser.on('infoMessage', (token) => {
      this.emit('infoMessage', token);
    });

    this.tokenStreamParser.on('sspichallenge', (token) => {
      if (token.ntlmpacket) {
        this.ntlmpacket = token.ntlmpacket;
        this.ntlmpacketBuffer = token.ntlmpacketBuffer;
      }

      this.emit('sspichallenge', token);
    });

    this.tokenStreamParser.on('errorMessage', (token) => {
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
        const error = new ConnectionError(token.message, 'ELOGIN');

        const isLoginErrorTransient = this.transientErrorLookup.isTransientError(token.number);
        if (isLoginErrorTransient && this.curTransientRetryCount !== this.config.options.maxRetriesOnTransientErrors) {
          error.isTransient = true;
        }

        this.loginError = error;
      }
    });

    this.tokenStreamParser.on('databaseChange', (token) => {
      this.emit('databaseChange', token.newValue);
    });

    this.tokenStreamParser.on('languageChange', (token) => {
      this.emit('languageChange', token.newValue);
    });

    this.tokenStreamParser.on('charsetChange', (token) => {
      this.emit('charsetChange', token.newValue);
    });

    this.tokenStreamParser.on('fedAuthInfo', (token) => {
      this.dispatchEvent('fedAuthInfo', token);
    });

    this.tokenStreamParser.on('featureExtAck', (token) => {
      this.dispatchEvent('featureExtAck', token);
    });

    this.tokenStreamParser.on('loginack', (token) => {
      if (!token.tdsVersion) {
        // unsupported TDS version
        this.loginError = new ConnectionError('Server responded with unknown TDS version.', 'ETDS');
        this.loggedIn = false;
        return;
      }

      if (!token['interface']) {
        // unsupported interface
        this.loginError = new ConnectionError('Server responded with unsupported interface.', 'EINTERFACENOTSUPP');
        this.loggedIn = false;
        return;
      }

      // use negotiated version
      this.config.options.tdsVersion = token.tdsVersion;
      this.loggedIn = true;
    });

    this.tokenStreamParser.on('routingChange', (token) => {
      this.routingData = token.newValue;
      this.dispatchEvent('routingChange');
    });

    this.tokenStreamParser.on('packetSizeChange', (token) => {
      this.messageIo.packetSize(token.newValue);
    });

    // A new top-level transaction was started. This is not fired
    // for nested transactions.
    this.tokenStreamParser.on('beginTransaction', (token) => {
      this.transactionDescriptors.push(token.newValue);
      this.inTransaction = true;
    });

    // A top-level transaction was committed. This is not fired
    // for nested transactions.
    this.tokenStreamParser.on('commitTransaction', () => {
      this.transactionDescriptors.length = 1;
      this.inTransaction = false;
    });

    // A top-level transaction was rolled back. This is not fired
    // for nested transactions. This is also fired if a batch
    // aborting error happened that caused a rollback.
    this.tokenStreamParser.on('rollbackTransaction', () => {
      this.transactionDescriptors.length = 1;
      // An outermost transaction was rolled back. Reset the transaction counter
      this.inTransaction = false;
      this.emit('rollbackTransaction');
    });

    this.tokenStreamParser.on('columnMetadata', (token) => {
      const request = this.request;
      if (request) {
        if (!request.canceled) {
          let columns;
          if (this.config.options.useColumnNames) {
            columns = {};
            for (let j = 0, len = token.columns.length; j < len; j++) {
              const col = token.columns[j];
              if (columns[col.colName] == null) {
                columns[col.colName] = col;
              }
            }
          } else {
            columns = token.columns;
          }
          request.emit('columnMetadata', columns);
        }
      } else {
        this.emit('error', new Error("Received 'columnMetadata' when no sqlRequest is in progress"));
        this.close();
      }
    });

    this.tokenStreamParser.on('order', (token) => {
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

    this.tokenStreamParser.on('row', (token) => {
      const request = this.request;
      if (request) {
        if (!request.canceled) {
          if (this.config.options.rowCollectionOnRequestCompletion) {
            request.rows.push(token.columns);
          }
          if (this.config.options.rowCollectionOnDone) {
            request.rst.push(token.columns);
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

    this.tokenStreamParser.on('returnStatus', (token) => {
      const request = this.request;
      if (request) {
        if (!request.canceled) {
          // Keep value for passing in 'doneProc' event.
          this.procReturnStatusValue = token.value;
        }
      }
    });

    this.tokenStreamParser.on('returnValue', (token) => {
      const request = this.request;
      if (request) {
        if (!request.canceled) {
          request.emit('returnValue', token.paramName, token.value, token.metadata);
        }
      }
    });

    this.tokenStreamParser.on('doneProc', (token) => {
      const request = this.request;
      if (request) {
        if (!request.canceled) {
          request.emit('doneProc', token.rowCount, token.more, this.procReturnStatusValue, request.rst);
          this.procReturnStatusValue = undefined;
          if (token.rowCount !== undefined) {
            request.rowCount += token.rowCount;
          }
          if (this.config.options.rowCollectionOnDone) {
            request.rst = [];
          }
        }
      }
    });

    this.tokenStreamParser.on('doneInProc', (token) => {
      const request = this.request;
      if (request) {
        if (!request.canceled) {
          request.emit('doneInProc', token.rowCount, token.more, request.rst);
          if (token.rowCount !== undefined) {
            request.rowCount += token.rowCount;
          }
          if (this.config.options.rowCollectionOnDone) {
            request.rst = [];
          }
        }
      }
    });

    this.tokenStreamParser.on('done', (token) => {
      const request = this.request;
      if (request) {
        if (token.attention) {
          this.dispatchEvent('attention');
        }

        if (request.canceled) {
          // If we received a `DONE` token with `DONE_ERROR`, but no previous `ERROR` token,
          // We assume this is the indication that an in-flight request was canceled.
          if (token.sqlError && !request.error) {
            this.clearCancelTimer();
            request.error = new RequestError('Canceled.', 'ECANCEL');
          }
        } else {
          if (token.sqlError && !request.error) {
            // check if the DONE_ERROR flags was set, but an ERROR token was not sent.
            request.error = new RequestError('An unknown error has occurred.', 'UNKNOWN');
          }
          request.emit('done', token.rowCount, token.more, request.rst);
          if (token.rowCount !== undefined) {
            request.rowCount += token.rowCount;
          }
          if (this.config.options.rowCollectionOnDone) {
            request.rst = [];
          }
        }
      }
    });

    this.tokenStreamParser.on('endOfMessage', () => { // EOM pseudo token received
      if (this.state === this.STATE.SENT_CLIENT_REQUEST) {
        this.dispatchEvent('endOfMessageMarkerReceived');
      }
    });

    this.tokenStreamParser.on('resetConnection', () => {
      this.emit('resetConnection');
    });

    this.tokenStreamParser.on('tokenStreamError', (error) => {
      this.emit('error', error);
      this.close();
    });

    this.tokenStreamParser.on('drain', () => {
      // Bridge the release of backpressure from the token stream parser
      // transform to the packet stream transform.
      this.messageIo.resume();
    });
  }

  connect() {
    if (this.config.options.instanceName) {
      return new InstanceLookup().instanceLookup({
        server: this.config.server,
        instanceName: this.config.options.instanceName,
        timeout: this.config.options.connectTimeout
      }, (message, port) => {
        if (this.state === this.STATE.FINAL) {
          return;
        }

        if (message) {
          this.emit('connect', new ConnectionError(message, 'EINSTLOOKUP'));
        } else {
          this.connectOnPort(port, this.config.options.multiSubnetFailover);
        }
      });
    } else {
      return this.connectOnPort(this.config.options.port, this.config.options.multiSubnetFailover);
    }
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
        socket.destroy();
        return;
      }

      this.socket = socket;
      this.socket.on('error', (error) => {
        this.socketError(error);
      });
      this.socket.on('close', () => {
        this.socketClose();
      });
      this.socket.on('end', () => {
        this.socketEnd();
      });
      this.messageIo = new MessageIO(this.socket, this.config.options.packetSize, this.debug);
      this.messageIo.on('data', (data) => { this.dispatchEvent('data', data); });
      this.messageIo.on('message', () => { this.dispatchEvent('message'); });
      this.messageIo.on('secure', (cleartext) => { this.emit('secure', cleartext); });

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

    const request = this.request;
    if (!request) { return; }

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
    const message = `Failed to connect to ${this.config.server}${this.config.options.instanceName ? `\\${this.config.options.instanceName}` : `:${this.config.options.port}`} in ${this.config.options.connectTimeout}ms`;
    this.debug.log(message);
    this.emit('connect', new ConnectionError(message, 'ETIMEOUT'));
    this.connectTimer = undefined;
    this.dispatchEvent('connectTimeout');
  }

  cancelTimeout() {
    const message = `Failed to cancel request in ${this.config.options.cancelTimeout}ms`;
    this.debug.log(message);
    this.dispatchEvent('socketError', new ConnectionError(message, 'ETIMEOUT'));
  }

  requestTimeout() {
    const request = this.request;
    // This check here is for flow to understand that the request can not be undefined.
    if (!request) { return; }

    this.requestTimer = undefined;
    request.cancel();
    const timeout = (request.timeout !== undefined) ? request.timeout : this.config.options.requestTimeout;
    const message = 'Timeout: Request failed to complete in ' + timeout + 'ms';
    request.error = new RequestError(message, 'ETIMEOUT');
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

  transitionTo(newState: $Values<$PropertyType<Connection, 'STATE'>>) {
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

  dispatchEvent<T>(eventName: string, ...args: T) {
    if (this.state.events[eventName]) {
      this.state.events[eventName].apply(this, args);
    } else {
      this.emit('error', new Error(`No event '${eventName}' in state '${this.state.name}'`));
      this.close();
    }
  }

  socketError(error: Error) {
    if (this.state === this.STATE.CONNECTING || this.state === this.STATE.SENT_TLSSSLNEGOTIATION) {
      const message = `Failed to connect to ${this.config.server}:${this.config.options.port} - ${error.message}`;
      this.debug.log(message);
      this.emit('connect', new ConnectionError(message, 'ESOCKET'));
    } else {
      const message = `Connection lost - ${error.message}`;
      this.debug.log(message);
      this.emit('error', new ConnectionError(message, 'ESOCKET'));
    }
    this.dispatchEvent('socketError', error);
  }

  socketConnect() {
    this.socket.setKeepAlive(true, KEEP_ALIVE_INITIAL_DELAY);
    this.closed = false;
    this.debug.log('connected to ' + this.config.server + ':' + this.config.options.port);
    this.dispatchEvent('socketConnect');
  }

  socketEnd() {
    this.debug.log('socket ended');
    if (this.state !== this.STATE.FINAL) {
      const error = new ConnectionError('socket hang up');
      error.code = 'ECONNRESET';
      this.socketError(error);
    }
  }

  socketClose() {
    this.debug.log('connection to ' + this.config.server + ':' + this.config.options.port + ' closed');
    if (this.state === this.STATE.REROUTING) {
      const routingData = this.routingData;
      if (!routingData) { return; }
      this.debug.log('Rerouting to ' + routingData.server + ':' + routingData.port);
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

  sendFedAuthResponsePacket(tokenResponse: { accessToken: string }) {
    const accessTokenLen = Buffer.byteLength(tokenResponse.accessToken, 'ucs2');
    const data = Buffer.alloc(8 + accessTokenLen);
    let offset = 0;
    offset = data.writeUInt32LE(accessTokenLen + 4, offset);
    offset = data.writeUInt32LE(accessTokenLen, offset);
    data.write(tokenResponse.accessToken, offset, accessTokenLen, 'ucs2');
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
    return this.messageIo.sendMessage(TYPE.SQL_BATCH, payload.data);
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
    } else if (this.config.options.enableArithAbort === false) {
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

  /**
    Execute the SQL batch represented by <code>request</code>.

    There is no param support, and unlike <code>execSql</code>,
    it is not likely that SQL Server will reuse the execution plan it generates for the SQL.

    In almost all cases, <code>execSql</code> will be a better choice.

    @param {Request} request
      A <a href="api-request.html"><code>Request</code></a>
      object representing the request.
  */
  execSqlBatch(request: Request) {
    if (typeof request.sqlTextOrProcedure !== 'string') {
      throw new Error('');
    }

    this.makeRequest(request, TYPE.SQL_BATCH, new SqlBatchPayload(request.sqlTextOrProcedure, this.currentTransactionDescriptor(), this.config.options));
  }

  /**
    Execute the SQL represented by <code>request</code>.

    As <code>sp_executesql</code> is used to execute the SQL, if the same SQL is executed multiples times
    using this function, the SQL Server query optimizer is likely to reuse the execution plan it generates
    for the first execution.  This may also result in SQL server treating the request like a stored procedure
    which can result in the <a href="api-request.html#event_doneInProc"><code>doneInProc</code></a> or
    <a href="api-request.html#event_doneProc"><code>doneProc</code></a> events being emitted instead of the
    <a href="api-request.html#event_done"><code>done</code></a> event you might expect.  Using
    <code>execSqlBatch</code> will prevent this from occurring but may have a negative performance impact.

    Beware of the way that scoping rules apply, and how they may
    <a href="http://weblogs.sqlteam.com/mladenp/archive/2006/11/03/17197.aspx">affect local temp tables</a>.
    If you're running in to scoping issues, then <code>execSqlBatch</code> may be a better choice.
    See also <a href="https://github.com/pekim/tedious/issues/24">issue #24</a>.

    @param {Request} request
      A <a href="api-request.html"><code>Request</code></a>
      object representing the request.
  */
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
    Creates a new <a href="bulk-load.html">BulkLoad</a> instance.

    @param {string} table
      The name of the table to bulk-insert into.
    @param {Object} [options]
      BulkLoad options.
    @param {boolean} [options.checkConstraints=false]
      Honors constraints during bulk load, it is disabled by default.
    @param {boolean} [options.fireTriggers=false]
      Honors insert triggers during bulk load, it is disabled by default.
    @param {boolean} [options.keepNulls=false]
      Honors null value passed, ignores the default values set on table.
    @param {boolean} [options.tableLock=false]
      Places a bulk update(BU) lock on table while performing bulk load. Uses row locks by default.
    @param {Function} callback
      A function which will be called after the BulkLoad finishes executing. <code>rowCount</code> will equal the
      number of rows inserted.
    @return {BulkLoad}
  */
  newBulkLoad(table: string, options: Object | RequestCompletionCallback, callback: RequestCompletionCallback | void) {
    if (callback === undefined) {
      callback = options;
      options = {};
    }
    if (typeof options !== 'object') {
      throw new TypeError('"options" argument must be an object');
    }
    return new BulkLoad(table, this.config.options, options, callback);
  }

  /**
    Executes a <a href="bulk-load.html">BulkLoad</a>.

    @param {BulkLoad} bulkLoad
  */
  execBulkLoad(bulkLoad: BulkLoad) {
    bulkLoad.executionStarted = true;
    const request = new Request(bulkLoad.getBulkInsertSql(), (error) => {
      if (error) {
        if (error.code === 'UNKNOWN') {
          error.message += ' This is likely because the schema of the BulkLoad does not match the schema of the table you are attempting to insert into.';
        }
        bulkLoad.error = error;
        bulkLoad.callback(error);
        return;
      }

      this.makeRequest(bulkLoad, TYPE.BULK_LOAD, undefined);
    });

    bulkLoad.once('cancel', () => {
      request.cancel();
    });

    this.execSqlBatch(request);
  }

  /**
    Prepare the SQL represented by the request.

    The request can then be used in subsequent calls to
    <a href="#function_execute">execute</a> and <a href="#function_unprepare">unprepare</a>

    @param request
      A <a href="api-request.html"><code>Request</code></a>
      object representing the request.

      Parameters only require a name and type. Parameter values are ignored.
  */
  prepare(request: Request) {
    request.transformIntoPrepareRpc();
    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  /**
    Release the SQL Server resources associated with a previously prepared request.

    @param request
  */
  unprepare(request: Request) {
    request.transformIntoUnprepareRpc();
    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  /**
    Execute previously prepared SQL, using the supplied parameters.

    @param {Request} request
      A previously prepared <a href="api-request.html"><code>Request</code></a>.
    @param {Object} parameters
      An object whose names correspond to the names of parameters that were added to the
      <code>request</code> before it was prepared.
      The object's values are passed as the parameters' values when the request is executed.
  */
  execute(request: Request, parameters: Object) {
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
    Call a stored procedure represented by <code>request</code>.

    @param {Request} request
      A <a href="api-request.html"><code>Request</code></a>
      object representing the request.
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
    The callback is called when the request to start the transaction has completed,
    either successfully or with an error.
    If an error occurred then <code>err</code> will describe the error.

    As only one request at a time may be executed on a connection, another request should not
    be initiated until this callback is called.

    @callback Connection~beginTransactionCallback
    @param {Error?} err
    @return void
  */

  /**
    Start a transaction.

    @param {Connection~beginTransactionCallback} callback
      The callback is called when the request to start the transaction has completed,
      either successfully or with an error.
      If an error occurred then <code>err</code> will describe the error.

      As only one request at a time may be executed on a connection, another request should not
      be initiated until this callback is called.
    @param {string} name
      A string representing a name to associate with the transaction.

      Optional, and defaults to an empty string.
      Required when <code>isolationLevel</code> is present.
    @param {string} isolationLevel
      The isolation level that the transaction is to be run with.
      The isolation levels are available from <code>require('tedious').ISOLATION_LEVEL</code> .

      <ul>
        <li><code>READ_UNCOMMITTED</code></li>
        <li><code>READ_COMMITTED</code></li>
        <li><code>REPEATABLE_READ</code></li>
        <li><code>SERIALIZABLE</code></li>
        <li><code>SNAPSHOT</code></li>
      </ul>

      Optional, and defaults to the Connection's isolation level.
  */
  beginTransaction(callback: RequestCompletionCallback, name: string | void, isolationLevel: $Values<ISOLATION_LEVEL> | void) {
    isolationLevel || (isolationLevel = this.config.options.isolationLevel);
    const transaction = new Transaction(name || '', isolationLevel);
    if (this.config.options.tdsVersion < '7_2') {
      return this.execSqlBatch(new Request('SET TRANSACTION ISOLATION LEVEL ' + (transaction.isolationLevelToTSQL()) + ';BEGIN TRAN ' + transaction.name, (...args) => {
        this.transactionDepth++;
        if (this.transactionDepth === 1) {
          this.inTransaction = true;
        }
        callback(...args);
      }));
    }

    const request = new Request(undefined, callback);
    return this.makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.beginPayload(this.currentTransactionDescriptor()));
  }


  /**
    Commit a transaction.

    There should be an active transaction.
    That is, <a href="#function_beginTransaction"><code>beginTransaction</code></a> should have been previously called.

    @param {Function} callback
  */
  commitTransaction(callback: RequestCompletionCallback, name: string | void) {
    const transaction = new Transaction(name || '');
    if (this.config.options.tdsVersion < '7_2') {
      return this.execSqlBatch(new Request('COMMIT TRAN ' + transaction.name, (...args) => {
        this.transactionDepth--;
        if (this.transactionDepth === 0) {
          this.inTransaction = false;
        }
        callback(...args);
      }));
    }
    const request = new Request(undefined, callback);
    return this.makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.commitPayload(this.currentTransactionDescriptor()));
  }

  /**
    Rollback a transaction.

    There should be an active transaction.
    That is, <a href="#function_beginTransaction"><code>beginTransaction</code></a> should have been previously called.

    @param {Function} callback
  */
  rollbackTransaction(callback: RequestCompletionCallback, name: string | void) {
    const transaction = new Transaction(name || '');
    if (this.config.options.tdsVersion < '7_2') {
      return this.execSqlBatch(new Request('ROLLBACK TRAN ' + transaction.name, (...args) => {
        this.transactionDepth--;
        if (this.transactionDepth === 0) {
          this.inTransaction = false;
        }
        callback(...args);
      }));
    }
    const request = new Request(undefined, callback);
    return this.makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.rollbackPayload(this.currentTransactionDescriptor()));
  }

  /**
    Set a savepoint within a transaction.

    There should be an active transaction.
    That is, <a href="#function_beginTransaction"><code>beginTransaction</code></a> should have been previously called.

    @param {Function} callback
  */
  saveTransaction(callback: RequestCompletionCallback, name: string) {
    const transaction = new Transaction(name);
    if (this.config.options.tdsVersion < '7_2') {
      return this.execSqlBatch(new Request('SAVE TRAN ' + transaction.name, (...args) => {
        this.transactionDepth++;
        callback(...args);
      }));
    }
    const request = new Request(undefined, callback);
    return this.makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.savePayload(this.currentTransactionDescriptor()));
  }

  /**
    Run the given callback after starting a transaction, and commit or rollback the transaction afterwards.

    This is a helper that employs <a href="#function_beginTransaction"><code>beginTransaction</code></a>,
    <a href="#function_commitTransaction"><code>commitTransaction</code></a>,
    <a href="#function_rollbackTransaction"><code>rollbackTransaction</code></a> and
    <a href="#function_saveTransaction"><code>saveTransaction</code></a> to greatly simplify the
    use of database transactions and automatically handle transaction nesting.

    @param {Function} callback
    @param {string?} isolationLevel
  */
  transaction<T: mixed[]>(cb: (err: ?Error, cb?: (err: ?Error, done: (err: ?Error, ...args: T) => void, ...args: T) => void) => void, isolationLevel: $Values<ISOLATION_LEVEL> | void) {
    if (typeof cb !== 'function') {
      throw new TypeError('`cb` must be a function');
    }

    const useSavepoint = this.inTransaction;
    const name = '_tedious_' + (crypto.randomBytes(10).toString('hex'));
    const txDone = (err, done, ...args) => {
      if (err) {
        if (this.inTransaction && this.state === this.STATE.LOGGED_IN) {
          this.rollbackTransaction((txErr) => {
            done(txErr || err, ...args);
          }, name);
        } else {
          done(err, ...args);
        }
      } else {
        if (useSavepoint) {
          if (this.config.options.tdsVersion < '7_2') {
            this.transactionDepth--;
          }

          done(null, ...args);
        } else {
          this.commitTransaction((txErr) => {
            done(txErr, ...args);
          }, name);
        }
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

  makeRequest(request: Request | BulkLoad, packetType: $Values<typeof TYPE>, payload: SqlBatchPayload | RpcRequestPayload | void) {
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
      this.request.connection = this;
      this.request.rowCount = 0;
      this.request.rows = [];
      this.request.rst = [];

      let message;

      this.request.once('cancel', () => {
        if (!this.isRequestActive(request)) {
          // Cancel was called on a request that is no longer active on this connection
          return;
        }

        // There's two ways to handle request cancelation:
        if (message.writable) {
          // - if the message is still writable, we'll set the ignore bit
          message.ignore = true;
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
      } else if (payload) {
        this.createRequestTimer();

        message = this.messageIo.sendMessage(packetType, payload.data, this.resetConnectionOnNextRequest);

        this.resetConnectionOnNextRequest = false;
        this.debug.payload(function() {
          if (payload) {
            return payload.toString('  ');
          } else {
            return '';
          }
        });
      }

      this.transitionTo(this.STATE.SENT_CLIENT_REQUEST);

      if (request.paused) { // Request.pause() has been called before the request was started
        this.pauseRequest(request);
      }
    }
  }

  /**
    Cancel currently executing request.
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
    Reset the connection to its initial state.
    Can be useful for connection pool implementations.

    @param {Function} callback
  */
  reset(callback: (err: ?Error) => void) {
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

  getIsolationLevelText(isolationLevel: $Values<ISOLATION_LEVEL>) {
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

module.exports = Connection;

Connection.prototype.STATE = {
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
      data: function(data: Buffer) {
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
            this.emit('connect', new ConnectionError("Server requires encryption, set 'encrypt' config option to true.", 'EENCRYPT'));
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
      this.cleanupConnection(this.cleanupTypeEnum.REDIRECT);
    },
    events: {
      message: function() {},
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
      this.cleanupConnection(this.cleanupTypeEnum.RETRY);
    },
    events: {
      message: function() {},
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

          if (authentication.type === 'azure-active-directory-password') {
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
        if (authentication.type === 'azure-active-directory-password') {
          if (token.fedAuth === undefined) {
            this.loginError = new ConnectionError('Did not receive Active Directory authentication acknowledgement');
            this.loggedIn = false;
          } else if (token.fedAuth.length !== 0) {
            this.loginError = new ConnectionError(`Active Directory authentication acknowledgment for ${authentication.type} authentication method includes extra data`);
            this.loggedIn = false;
          }
        } else {
          if (token.fedAuth === undefined) {
            this.loginError = new ConnectionError('Received acknowledgement for unknown feature');
            this.loggedIn = false;
          } else {
            this.loginError = new ConnectionError('Did not request Active Directory authentication, but received the acknowledgment');
            this.loggedIn = false;
          }
        }
      },
      message: function() {
        if (this.loggedIn) {
          this.transitionTo(this.STATE.LOGGED_IN_SENDING_INITIAL_SQL);
        } else {
          if (this.loginError) {
            if (this.loginError.isTransient) {
              this.debug.log('Initiating retry on transient error');
              this.transitionTo(this.STATE.TRANSIENT_FAILURE_RETRY);
            } else {
              this.emit('connect', this.loginError);
              this.transitionTo(this.STATE.FINAL);
            }
          } else {
            this.emit('connect', new ConnectionError('Login failed.', 'ELOGIN'));
            this.transitionTo(this.STATE.FINAL);
          }
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
          const { authentication } = this.config;

          const payload = new NTLMResponsePayload({
            domain: authentication.options.domain,
            userName: authentication.options.userName,
            password: authentication.options.password,
            database: this.config.options.database,
            appName: this.config.options.appName,
            packetSize: this.config.options.packetSize,
            tdsVersion: this.config.options.tdsVersion,
            ntlmpacket: this.ntlmpacket,
            additional: this.additional
          });

          this.messageIo.sendMessage(TYPE.NTLMAUTH_PKT, payload.data);
          this.debug.payload(function() {
            return payload.toString('  ');
          });

          this.ntlmpacket = undefined;
        } else {
          if (this.loggedIn) {
            this.transitionTo(this.STATE.LOGGED_IN_SENDING_INITIAL_SQL);
          } else {
            if (this.loginError) {
              if (this.loginError.isTransient) {
                this.debug.log('Initiating retry on transient error');
                this.transitionTo(this.STATE.TRANSIENT_FAILURE_RETRY);
              } else {
                this.emit('connect', this.loginError);
                this.transitionTo(this.STATE.FINAL);
              }
            } else {
              this.emit('connect', new ConnectionError('Login failed.', 'ELOGIN'));
              this.transitionTo(this.STATE.FINAL);
            }
          }
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
        if (this.fedAuthInfoToken && this.fedAuthInfoToken.stsurl && this.fedAuthInfoToken.spn) {
          const clientId = '7f98cb04-cd1e-40df-9140-3bf7e2cea4db';
          const context = new AuthenticationContext(this.fedAuthInfoToken.stsurl);
          const authentication = this.config.authentication;

          context.acquireTokenWithUsernamePassword(this.fedAuthInfoToken.spn, authentication.options.userName, authentication.options.password, clientId, (err, tokenResponse) => {
            if (err) {
              this.loginError = new ConnectionError('Security token could not be authenticated or authorized.', 'EFEDAUTH');
              this.emit('connect', this.loginError);
              this.transitionTo(this.STATE.FINAL);
              return;
            }

            this.sendFedAuthResponsePacket(tokenResponse);
          });
        } else {
          if (this.loginError) {
            if (this.loginError.isTransient) {
              this.debug.log('Initiating retry on transient error');
              this.transitionTo(this.STATE.TRANSIENT_FAILURE_RETRY);
            } else {
              this.emit('connect', this.loginError);
              this.transitionTo(this.STATE.FINAL);
            }
          } else {
            this.emit('connect', new ConnectionError('Login failed.', 'ELOGIN'));
            this.transitionTo(this.STATE.FINAL);
          }
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
        const sqlRequest = this.request;
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
        const sqlRequest = this.request;
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
        const sqlRequest = this.request;
        this.request = undefined;

        this.transitionTo(this.STATE.FINAL);

        sqlRequest.callback(err);
      },
      data: function(data: Buffer) {
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

          const sqlRequest = this.request;
          this.request = undefined;
          this.transitionTo(this.STATE.LOGGED_IN);

          if (sqlRequest.error && sqlRequest.error instanceof RequestError && sqlRequest.error.code === 'ETIMEOUT') {
            sqlRequest.callback(sqlRequest.error);
          } else {
            sqlRequest.callback(new RequestError('Canceled.', 'ECANCEL'));
          }
        }
      }
    }
  },
  FINAL: {
    name: 'Final',
    enter: function() {
      this.cleanupConnection(this.cleanupTypeEnum.NORMAL);
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
