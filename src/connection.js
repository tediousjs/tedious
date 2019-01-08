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

class Connection extends EventEmitter {
  constructor(config) {
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

      authentication = {
        type: config.authentication.type,
        options: config.authentication.type === 'ntlm' ? {
          userName: config.authentication.options.userName,
          password: config.authentication.options.password,
          domain: config.authentication.options.domain && config.authentication.options.domain.toUpperCase()
        } : {
          userName: config.authentication.options.userName,
          password: config.authentication.options.password
        }
      };
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

      authentication = {
        type: config.domain ? 'ntlm' : 'default',
        options: {
          userName: config.userName,
          password: config.password,
          domain: config.domain && config.domain.toUpperCase()
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
        this.config.options.port = undefined;
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

  close() {
    this.transitionTo(this.STATE.FINAL);
  }

  initialiseConnection() {
    this.connect();
    this.createConnectTimer();
  }

  cleanupConnection(cleanupTypeEnum) {
    if (!this.closed) {
      this.clearConnectTimer();
      this.clearRequestTimer();
      this.clearRetryTimer();
      this.closeConnection();
      if (cleanupTypeEnum === this.cleanupTypeEnum.REDIRECT) {
        this.emit('rerouting');
      } else if (cleanupTypeEnum !== this.cleanupTypeEnum.RETRY) {
        this.emit('end');
      }
      if (this.request) {
        const err = RequestError('Connection closed before request completed.', 'ECLOSE');
        this.request.callback(err);
        this.request = undefined;
      }
      this.closed = true;
      this.loggedIn = false;
      this.loginError = null;
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
        if (this.request) {
          this.request.error = RequestError(token.message, 'EREQUEST');
          this.request.error.number = token.number;
          this.request.error.state = token.state;
          this.request.error['class'] = token['class'];
          this.request.error.serverName = token.serverName;
          this.request.error.procName = token.procName;
          this.request.error.lineNumber = token.lineNumber;
        }
      } else {
        const isLoginErrorTransient = this.transientErrorLookup.isTransientError(token.number);
        if (isLoginErrorTransient && this.curTransientRetryCount !== this.config.options.maxRetriesOnTransientErrors) {
          this.debug.log('Initiating retry on transient error = ', token.number);
          this.transitionTo(this.STATE.TRANSIENT_FAILURE_RETRY);
        } else {
          this.loginError = ConnectionError(token.message, 'ELOGIN');
        }
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
        this.loginError = ConnectionError('Server responded with unknown TDS version.', 'ETDS');
        this.loggedIn = false;
        return;
      }

      if (!token['interface']) {
        // unsupported interface
        this.loginError = ConnectionError('Server responded with unsupported interface.', 'EINTERFACENOTSUPP');
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
      if (this.request) {
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
        this.request.emit('columnMetadata', columns);
      } else {
        this.emit('error', new Error("Received 'columnMetadata' when no sqlRequest is in progress"));
        this.close();
      }
    });

    this.tokenStreamParser.on('order', (token) => {
      if (this.request) {
        this.request.emit('order', token.orderColumns);
      } else {
        this.emit('error', new Error("Received 'order' when no sqlRequest is in progress"));
        this.close();
      }
    });

    this.tokenStreamParser.on('row', (token) => {
      if (this.request) {
        if (this.config.options.rowCollectionOnRequestCompletion) {
          this.request.rows.push(token.columns);
        }
        if (this.config.options.rowCollectionOnDone) {
          this.request.rst.push(token.columns);
        }
        if (!(this.state === this.STATE.SENT_ATTENTION && this.request.paused)) {
          this.request.emit('row', token.columns);
        }
      } else {
        this.emit('error', new Error("Received 'row' when no sqlRequest is in progress"));
        this.close();
      }
    });

    this.tokenStreamParser.on('returnStatus', (token) => {
      if (this.request) {
        // Keep value for passing in 'doneProc' event.
        this.procReturnStatusValue = token.value;
      }
    });

    this.tokenStreamParser.on('returnValue', (token) => {
      if (this.request) {
        this.request.emit('returnValue', token.paramName, token.value, token.metadata);
      }
    });

    this.tokenStreamParser.on('doneProc', (token) => {
      if (this.request) {
        this.request.emit('doneProc', token.rowCount, token.more, this.procReturnStatusValue, this.request.rst);
        this.procReturnStatusValue = undefined;
        if (token.rowCount !== undefined) {
          this.request.rowCount += token.rowCount;
        }
        if (this.config.options.rowCollectionOnDone) {
          this.request.rst = [];
        }
      }
    });

    this.tokenStreamParser.on('doneInProc', (token) => {
      if (this.request) {
        this.request.emit('doneInProc', token.rowCount, token.more, this.request.rst);
        if (token.rowCount !== undefined) {
          this.request.rowCount += token.rowCount;
        }
        if (this.config.options.rowCollectionOnDone) {
          this.request.rst = [];
        }
      }
    });

    this.tokenStreamParser.on('done', (token) => {
      if (this.request) {
        if (token.attention) {
          this.dispatchEvent('attention');
        }
        if (token.sqlError && !this.request.error) {
          // check if the DONE_ERROR flags was set, but an ERROR token was not sent.
          this.request.error = RequestError('An unknown error has occurred.', 'UNKNOWN');
        }
        this.request.emit('done', token.rowCount, token.more, this.request.rst);
        if (token.rowCount !== undefined) {
          this.request.rowCount += token.rowCount;
        }
        if (this.config.options.rowCollectionOnDone) {
          this.request.rst = [];
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
    if (this.config.options.port) {
      return this.connectOnPort(this.config.options.port, this.config.options.multiSubnetFailover);
    } else {
      return new InstanceLookup().instanceLookup({
        server: this.config.server,
        instanceName: this.config.options.instanceName,
        timeout: this.config.options.connectTimeout
      }, (message, port) => {
        if (this.state === this.STATE.FINAL) {
          return;
        }
        if (message) {
          this.emit('connect', ConnectionError(message, 'EINSTLOOKUP'));
        } else {
          this.connectOnPort(port, this.config.options.multiSubnetFailover);
        }
      });
    }
  }

  connectOnPort(port, multiSubnetFailover) {
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

      this.messageIo.on('data', (message) => {
        this.dispatchEvent('message', message);
      });

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

  createRequestTimer() {
    this.clearRequestTimer(); // release old timer, just to be safe
    const timeout = (this.request.timeout !== undefined) ? this.request.timeout : this.config.options.requestTimeout;
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

  requestTimeout() {
    this.requestTimer = undefined;
    this.messageIo.sendMessage(TYPE.ATTENTION);
    this.transitionTo(this.STATE.SENT_ATTENTION);
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

  transitionTo(newState) {
    if (this.state === newState) {
      this.debug.log('State is already ' + newState.name);
      return;
    }

    if (this.state && this.state.exit) {
      this.state.exit.call(this, newState);
    }

    this.debug.log('State change: ' + (this.state ? this.state.name : undefined) + ' -> ' + newState.name);
    this.state = newState;

    if (this.state.enter) {
      this.state.enter.apply(this);
    }
  }

  dispatchEvent(eventName, ...args) {
    if (this.state.events[eventName]) {
      this.state.events[eventName].apply(this, args);
    } else {
      this.emit('error', new Error(`No event '${eventName}' in state '${this.state.name}'`));
      this.close();
    }
  }

  socketError(error) {
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
    this.socket.setKeepAlive(true, KEEP_ALIVE_INITIAL_DELAY);
    this.closed = false;
    this.debug.log('connected to ' + this.config.server + ':' + this.config.options.port);
    this.dispatchEvent('socketConnect');
  }

  socketEnd() {
    this.debug.log('socket ended');
    if (this.state !== this.STATE.FINAL) {
      const error = new Error('socket hang up');
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
      const server = this.routingData ? this.routingData.server : this.server;
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

  addToMessageBuffer(data) {
    this.messageBuffer = Buffer.concat([this.messageBuffer, data]);
  }

  processPreLoginResponse() {
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

      this.dispatchEvent('tls');
    } else {
      this.dispatchEvent('noTls');
    }
  }

  sendLogin7Packet(cb) {
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

    process.nextTick(cb);
  }

  sendNTLMResponsePacket() {
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

    process.nextTick(() => {
      this.transitionTo(this.STATE.SENT_NTLM_RESPONSE);
    });
  }

  sendFedAuthResponsePacket(tokenResponse) {
    const accessTokenLen = Buffer.byteLength(tokenResponse.accessToken, 'ucs2');
    const data = Buffer.alloc(8 + accessTokenLen);
    let offset = 0;
    offset = data.writeUInt32LE(accessTokenLen + 4, offset);
    offset = data.writeUInt32LE(accessTokenLen, offset);
    data.write(tokenResponse.accessToken, offset, 'ucs2');
    this.messageIo.sendMessage(TYPE.FEDAUTH_TOKEN, data);
    // sent the fedAuth token message, the rest is similar to standard login 7
    process.nextTick(() => {
      this.transitionTo(this.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
    });
  }

  // Returns false to apply backpressure.
  sendDataToTokenStreamParser(data) {
    return this.tokenStreamParser.addBuffer(data);
  }

  // This is an internal method that is called from Request.pause().
  // It has to check whether the passed Request object represents the currently
  // active request, because the application might have called Request.pause()
  // on an old inactive Request object.
  pauseRequest(request) {
    if (this.isRequestActive(request)) {
      this.tokenStreamParser.pause();
    }
  }

  // This is an internal method that is called from Request.resume().
  resumeRequest(request) {
    if (this.isRequestActive(request)) {
      this.tokenStreamParser.resume();
    }
  }

  // Returns true if the passed request is the currently active request of the connection.
  isRequestActive(request) {
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

  processLogin7Response() {
    if (this.loggedIn) {
      this.dispatchEvent('loggedIn');
    } else {
      if (this.loginError) {
        this.emit('connect', this.loginError);
      } else {
        this.emit('connect', ConnectionError('Login failed.', 'ELOGIN'));
      }
      this.dispatchEvent('loginFailed');
    }
  }

  processLogin7NTLMResponse() {
    if (this.ntlmpacket) {
      this.dispatchEvent('receivedChallenge');
    } else {
      if (this.loginError) {
        this.emit('connect', this.loginError);
      } else {
        this.emit('connect', ConnectionError('Login failed.', 'ELOGIN'));
      }
      this.dispatchEvent('loginFailed');
    }
  }

  processLogin7NTLMAck() {
    if (this.loggedIn) {
      this.dispatchEvent('loggedIn');
    } else {
      if (this.loginError) {
        this.emit('connect', this.loginError);
      } else {
        this.emit('connect', ConnectionError('Login failed.', 'ELOGIN'));
      }
      this.dispatchEvent('loginFailed');
    }
  }

  execSqlBatch(request) {
    this.makeRequest(request, TYPE.SQL_BATCH, new SqlBatchPayload(request.sqlTextOrProcedure, this.currentTransactionDescriptor(), this.config.options));
  }

  execSql(request) {
    request.transformIntoExecuteSqlRpc();

    if (request.error != null) {
      process.nextTick(() => {
        this.debug.log(request.error.message);
        request.callback(request.error);
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
  newBulkLoad(table, options, callback) {
    if (callback === undefined) {
      callback = options;
      options = {};
    }
    if (typeof options !== 'object') {
      throw new TypeError('"options" argument must be an object');
    }
    return new BulkLoad(table, this.config.options, options, callback);
  }

  execBulkLoad(bulkLoad) {
    const request = new Request(bulkLoad.getBulkInsertSql(), (error) => {
      if (error) {
        if (error.code === 'UNKNOWN') {
          error.message += ' This is likely because the schema of the BulkLoad does not match the schema of the table you are attempting to insert into.';
        }
        bulkLoad.error = error;
        bulkLoad.callback(error);
      } else {
        this.makeRequest(bulkLoad, TYPE.BULK_LOAD, bulkLoad.getPayload());
      }
    });

    this.execSqlBatch(request);
  }

  prepare(request) {
    request.transformIntoPrepareRpc();
    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  unprepare(request) {
    request.transformIntoUnprepareRpc();
    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  execute(request, parameters) {
    request.transformIntoExecuteRpc(parameters);

    if (request.error != null) {
      process.nextTick(() => {
        this.debug.log(request.error.message);
        request.callback(request.error);
      });

      return;
    }

    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  callProcedure(request) {
    request.validateParameters();

    if (request.error != null) {
      process.nextTick(() => {
        this.debug.log(request.error.message);
        request.callback(request.error);
      });
      return;
    }

    this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  beginTransaction(callback, name, isolationLevel) {
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

    const request = new Request(undefined, (err) => {
      return callback(err, this.currentTransactionDescriptor());
    });
    return this.makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.beginPayload(this.currentTransactionDescriptor()));
  }

  commitTransaction(callback, name) {
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

  rollbackTransaction(callback, name) {
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

  saveTransaction(callback, name) {
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

  transaction(cb, isolationLevel) {
    if (typeof cb !== 'function') {
      throw new TypeError('`cb` must be a function');
    }

    const useSavepoint = this.inTransaction;
    const name = '_tedious_' + (crypto.randomBytes(10).toString('hex'));
    const txDone = (err, done, ...args) => {
      if (err) {
        if (this.inTransaction && this.state === this.STATE.LOGGED_IN) {
          return this.rollbackTransaction((txErr) => {
            done(txErr || err, ...args);
          }, name);
        } else {
          return process.nextTick(() => {
            done(err, ...args);
          });
        }
      } else {
        if (useSavepoint) {
          return process.nextTick(() => {
            if (this.config.options.tdsVersion < '7_2') {
              this.transactionDepth--;
            }
            done(null, ...args);
          });
        } else {
          return this.commitTransaction((txErr) => {
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

  makeRequest(request, packetType, payload) {
    if (this.state !== this.STATE.LOGGED_IN) {
      const message = 'Requests can only be made in the ' + this.STATE.LOGGED_IN.name + ' state, not the ' + this.state.name + ' state';
      this.debug.log(message);
      request.callback(RequestError(message, 'EINVALIDSTATE'));
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
      this.createRequestTimer();
      this.messageIo.sendMessage(packetType, payload.data, this.resetConnectionOnNextRequest);
      this.resetConnectionOnNextRequest = false;
      this.debug.payload(function() {
        return payload.toString('  ');
      });
      this.transitionTo(this.STATE.SENT_CLIENT_REQUEST);
      if (request.paused) { // Request.pause() has been called before the request was started
        this.pauseRequest(request);
      }
    }
  }

  cancel() {
    if (this.state !== this.STATE.SENT_CLIENT_REQUEST) {
      const message = 'Requests can only be canceled in the ' + this.STATE.SENT_CLIENT_REQUEST.name + ' state, not the ' + this.state.name + ' state';
      this.debug.log(message);
      return false;
    } else {
      this.request.canceled = true;
      this.messageIo.sendMessage(TYPE.ATTENTION);
      this.transitionTo(this.STATE.SENT_ATTENTION);
      return true;
    }
  }

  reset(callback) {
    const request = new Request(this.getInitialSql(), (err) => {
      if (this.config.options.tdsVersion < '7_2') {
        this.inTransaction = false;
      }
      callback(err);
    });
    this.resetConnectionOnNextRequest = true;
    return this.execSqlBatch(request);
  }

  currentTransactionDescriptor() {
    return this.transactionDescriptors[this.transactionDescriptors.length - 1];
  }

  getIsolationLevelText(isolationLevel) {
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
      message: function(message) {
        message.on('data', (data) => {
          this.addToMessageBuffer(data);
        });

        message.on('end', () => {
          this.processPreLoginResponse();
        });
      },
      noTls: function() {
        this.sendLogin7Packet(() => {
          const { authentication } = this.config;
          if (authentication.type === 'ntlm') {
            this.transitionTo(this.STATE.SENT_LOGIN7_WITH_NTLM);
          } else {
            this.transitionTo(this.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
          }
        });
      },
      tls: function() {
        this.messageIo.startTls(this.secureContext, this.config.server, this.config.options.trustServerCertificate);
        this.transitionTo(this.STATE.SENT_TLSSSLNEGOTIATION);
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
      message: function(message) {
        message.on('data', (data) => {
          this.messageIo.tlsHandshakeData(data);
        });

        message.on('end', () => {
          if (this.messageIo.tlsNegotiationComplete) {
            this.sendLogin7Packet(() => {
              const { authentication } = this.config;

              if (authentication.type === 'azure-active-directory-password') {
                this.transitionTo(this.STATE.SENT_LOGIN7_WITH_FEDAUTH);
              } else if (authentication.type === 'ntlm') {
                this.transitionTo(this.STATE.SENT_LOGIN7_WITH_NTLM);
              } else {
                this.transitionTo(this.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
              }
            });
          }
        });
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
      loggedIn: function() {
        this.transitionTo(this.STATE.LOGGED_IN_SENDING_INITIAL_SQL);
      },
      routingChange: function() {
        this.transitionTo(this.STATE.REROUTING);
      },
      loginFailed: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      featureExtAck: function(token) {
        const { authentication } = this.config;
        if (authentication.type === 'azure-active-directory-password') {
          if (token.fedAuth === undefined) {
            this.loginError = ConnectionError('Did not receive Active Directory authentication acknowledgement');
            this.loggedIn = false;
          } else if (token.fedAuth.length !== 0) {
            this.loginError = ConnectionError(`Active Directory authentication acknowledgment for ${authentication.type} authentication method includes extra data`);
            this.loggedIn = false;
          }
        } else {
          if (token.fedAuth === undefined) {
            this.loginError = ConnectionError('Received acknowledgement for unknown feature');
            this.loggedIn = false;
          } else {
            this.loginError = ConnectionError('Did not request Active Directory authentication, but received the acknowledgment');
            this.loggedIn = false;
          }
        }
      },
      message: function(message) {
        message.on('data', (data) => {
          this.sendDataToTokenStreamParser(data);
        });

        message.on('end', () => {
          this.processLogin7Response();
        });
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
      receivedChallenge: function() {
        this.sendNTLMResponsePacket();
      },
      loginFailed: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      message: function(message) {
        message.on('data', (data) => {
          this.sendDataToTokenStreamParser(data);
        });

        message.on('end', () => {
          this.processLogin7NTLMResponse();
        });
      }
    }
  },
  SENT_NTLM_RESPONSE: {
    name: 'SentNTLMResponse',
    events: {
      socketError: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      loggedIn: function() {
        this.transitionTo(this.STATE.LOGGED_IN_SENDING_INITIAL_SQL);
      },
      loginFailed: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      routingChange: function() {
        this.transitionTo(this.STATE.REROUTING);
      },
      message: function(message) {
        message.on('data', (data) => {
          this.sendDataToTokenStreamParser(data);
        });

        message.on('end', () => {
          this.processLogin7NTLMAck();
        });
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
      loginFailed: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      routingChange: function() {
        this.transitionTo(this.STATE.REROUTING);
      },
      fedAuthInfo: function(token) {
        this.fedAuthInfoToken = token;
      },
      message: function(message) {
        message.on('data', (data) => {
          this.sendDataToTokenStreamParser(data);
        });

        message.on('end', () => {
          if (this.fedAuthInfoToken && this.fedAuthInfoToken.stsurl && this.fedAuthInfoToken.spn) {
            const clientId = '7f98cb04-cd1e-40df-9140-3bf7e2cea4db';
            const context = new AuthenticationContext(this.fedAuthInfoToken.stsurl);
            const authentication = this.config.authentication;

            context.acquireTokenWithUsernamePassword(this.fedAuthInfoToken.spn, authentication.options.userName, authentication.options.password, clientId, (err, tokenResponse) => {
              if (err) {
                this.loginError = ConnectionError('Security token could not be authenticated or authorized.', 'EFEDAUTH');
                this.emit('connect', this.loginError);
                this.dispatchEvent('loginFailed');
                return;
              }

              this.sendFedAuthResponsePacket(tokenResponse);
            });
          } else {
            if (this.loginError) {
              this.emit('connect', this.loginError);
            } else {
              this.emit('connect', ConnectionError('Login failed.', 'ELOGIN'));
            }

            this.dispatchEvent('loginFailed');
          }
        });
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
      message: function(message) {
        message.on('data', (data) => {
          this.sendDataToTokenStreamParser(data);
        });

        message.on('end', () => {
          this.transitionTo(this.STATE.LOGGED_IN);
          this.processedInitialSql();
        });
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
        sqlRequest.callback(err);
        this.transitionTo(this.STATE.FINAL);
      },
      message: function(message) {
        // request timer is stopped once the incoming message is received
        this.clearRequestTimer();

        message.on('data', (data) => {
          const ret = this.sendDataToTokenStreamParser(data);
          if (ret === false) {
            // Bridge backpressure from the token stream parser transform to the
            // packet stream transform.
            this.messageIo.pause();
          }
        });

        message.on('end', () => {
          // We have to channel the 'message' (EOM) event through the token stream
          // parser transform, to keep it in line with the flow of the tokens, when
          // the incoming data flow is paused and resumed.
          this.tokenStreamParser.addEndOfMessageMarker();
        });
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
      socketError: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      attention: function() {
        this.attentionReceived = true;
      },
      message: function(message) {
        message.on('data', (data) => {
          this.sendDataToTokenStreamParser(data);
        });

        message.on('end', () => {
          // 3.2.5.7 Sent Attention State
          // Discard any data contained in the response, until we receive the attention response
          if (this.attentionReceived) {
            const sqlRequest = this.request;
            this.request = undefined;
            this.transitionTo(this.STATE.LOGGED_IN);
            if (sqlRequest.canceled) {
              sqlRequest.callback(RequestError('Canceled.', 'ECANCEL'));
            } else {
              const timeout = (sqlRequest.timeout !== undefined) ? sqlRequest.timeout : this.config.options.requestTimeout;
              const message = 'Timeout: Request failed to complete in ' + timeout + 'ms';
              sqlRequest.callback(RequestError(message, 'ETIMEOUT'));
            }
          }
        });
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
