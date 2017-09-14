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
const crypto = require('crypto');
const ConnectionError = require('./errors').ConnectionError;
const RequestError = require('./errors').RequestError;
const Connector = require('./connector').Connector;
const SspiModuleSupported = require('sspi-client').ModuleSupported;
const SspiClientApi = require('sspi-client').SspiClientApi;
const Fqdn = require('sspi-client').Fqdn;
const MakeSpn = require('sspi-client').MakeSpn;

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

    if (!config) {
      throw new TypeError('No connection configuration given');
    }

    if (typeof config.server !== 'string') {
      throw new TypeError('Invalid server: ' + config.server);
    }

    this.config = {
      server: config.server,
      userName: config.userName,
      password: config.password,
      domain: config.domain && config.domain.toUpperCase(),
      securityPackage: config.securityPackage,
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
        enableCursorCloseOnCommit: false,
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

      if (config.options.abortTransactionOnError != undefined) {
        if (typeof config.options.abortTransactionOnError !== 'boolean') {
          throw new TypeError('options.abortTransactionOnError must be a boolean (true or false).');
        }

        this.config.options.abortTransactionOnError = config.options.abortTransactionOnError;
      }

      if (config.options.appName != undefined) {
        this.config.options.appName = config.options.appName;
      }

      if (config.options.camelCaseColumns != undefined) {
        this.config.options.camelCaseColumns = config.options.camelCaseColumns;
      }

      if (config.options.cancelTimeout != undefined) {
        this.config.options.cancelTimeout = config.options.cancelTimeout;
      }

      if (config.options.columnNameReplacer) {
        if (typeof config.options.columnNameReplacer !== 'function') {
          throw new TypeError('options.columnNameReplacer must be a function or null.');
        }

        this.config.options.columnNameReplacer = config.options.columnNameReplacer;
      }

      if (config.options.connectTimeout) {
        this.config.options.connectTimeout = config.options.connectTimeout;
      }

      if (config.options.connectionIsolationLevel) {
        this.config.options.connectionIsolationLevel = config.options.connectionIsolationLevel;
      }

      if (config.options.cryptoCredentialsDetails) {
        this.config.options.cryptoCredentialsDetails = config.options.cryptoCredentialsDetails;
      }

      if (config.options.database != undefined) {
        this.config.options.database = config.options.database;
      }

      if (config.options.datefirst) {
        if (config.options.datefirst < 1 || config.options.datefirst > 7) {
          throw new RangeError('DateFirst should be >= 1 and <= 7');
        }

        this.config.options.datefirst = config.options.datefirst;
      }

      if (config.options.dateFormat != undefined) {
        this.config.options.dateFormat = config.options.dateFormat;
      }

      if (config.options.debug) {
        if (config.options.debug.data != undefined) {
          this.config.options.debug.data = config.options.debug.data;
        }
        if (config.options.debug.packet != undefined) {
          this.config.options.debug.packet = config.options.debug.packet;
        }
        if (config.options.debug.payload != undefined) {
          this.config.options.debug.payload = config.options.debug.payload;
        }
        if (config.options.debug.token != undefined) {
          this.config.options.debug.token = config.options.debug.token;
        }
      }

      if (config.options.enableAnsiNull != undefined) {
        if (typeof config.options.enableAnsiNull !== 'boolean') {
          throw new TypeError('options.enableAnsiNull must be a boolean (true or false).');
        }

        this.config.options.enableAnsiNull = config.options.enableAnsiNull;
      }

      if (config.options.enableAnsiNullDefault != undefined) {
        if (typeof config.options.enableAnsiNullDefault !== 'boolean') {
          throw new TypeError('options.enableAnsiNullDefault must be a boolean (true or false).');
        }

        this.config.options.enableAnsiNullDefault = config.options.enableAnsiNullDefault;
      }

      if (config.options.enableAnsiPadding != undefined) {
        if (typeof config.options.enableAnsiPadding !== 'boolean') {
          throw new TypeError('options.enableAnsiPadding must be a boolean (true or false).');
        }

        this.config.options.enableAnsiPadding = config.options.enableAnsiPadding;
      }

      if (config.options.enableAnsiWarnings != undefined) {
        if (typeof config.options.enableAnsiWarnings !== 'boolean') {
          throw new TypeError('options.enableAnsiWarnings must be a boolean (true or false).');
        }

        this.config.options.enableAnsiWarnings = config.options.enableAnsiWarnings;
      }

      if (config.options.enableArithAbort !== undefined) {
        if (typeof config.options.enableArithAbort !== 'boolean') {
          throw new TypeError('options.enableArithAbort must be a boolean (true or false).');
        }

        this.config.options.enableArithAbort = config.options.enableArithAbort;
      }

      if (config.options.enableConcatNullYieldsNull != undefined) {
        if (typeof config.options.enableConcatNullYieldsNull !== 'boolean') {
          throw new TypeError('options.enableConcatNullYieldsNull must be a boolean (true or false).');
        }

        this.config.options.enableConcatNullYieldsNull = config.options.enableConcatNullYieldsNull;
      }

      if (config.options.enableCursorCloseOnCommit != undefined) {
        if (typeof config.options.enableCursorCloseOnCommit !== 'boolean') {
          throw new TypeError('options.enableCursorCloseOnCommit must be a boolean (true or false).');
        }

        this.config.options.enableCursorCloseOnCommit = config.options.enableCursorCloseOnCommit;
      }

      if (config.options.enableImplicitTransactions != undefined) {
        if (typeof config.options.enableImplicitTransactions !== 'boolean') {
          throw new TypeError('options.enableImplicitTransactions must be a boolean (true or false).');
        }

        this.config.options.enableImplicitTransactions = config.options.enableImplicitTransactions;
      }

      if (config.options.enableNumericRoundabort != undefined) {
        if (typeof config.options.enableNumericRoundabort !== 'boolean') {
          throw new TypeError('options.enableNumericRoundabort must be a boolean (true or false).');
        }

        this.config.options.enableNumericRoundabort = config.options.enableNumericRoundabort;
      }

      if (config.options.enableQuotedIdentifier !== undefined) {
        if (typeof config.options.enableQuotedIdentifier !== 'boolean') {
          throw new TypeError('options.enableQuotedIdentifier must be a boolean (true or false).');
        }

        this.config.options.enableQuotedIdentifier = config.options.enableQuotedIdentifier;
      }

      if (config.options.encrypt != undefined) {
        this.config.options.encrypt = config.options.encrypt;
      }

      if (config.options.fallbackToDefaultDb != undefined) {
        this.config.options.fallbackToDefaultDb = config.options.fallbackToDefaultDb;
      }

      if (config.options.instanceName != undefined) {
        this.config.options.instanceName = config.options.instanceName;
        this.config.options.port = undefined;
      }

      if (config.options.isolationLevel) {
        this.config.options.isolationLevel = config.options.isolationLevel;
      }

      if (config.options.language != undefined) {
        this.config.options.language = config.options.language;
      }

      if (config.options.localAddress != undefined) {
        this.config.options.localAddress = config.options.localAddress;
      }

      if (config.options.multiSubnetFailover != undefined) {
        this.config.options.multiSubnetFailover = !!config.options.multiSubnetFailover;
      }

      if (config.options.packetSize) {
        this.config.options.packetSize = config.options.packetSize;
      }

      if (config.options.port) {
        if (config.options.port < 0 || config.options.port > 65536) {
          throw new RangeError('Port must be > 0 and < 65536');
        }

        this.config.options.port = config.options.port;
        this.config.options.instanceName = undefined;
      }

      if (config.options.readOnlyIntent != undefined) {
        this.config.options.readOnlyIntent = config.options.readOnlyIntent;
      }

      if (config.options.requestTimeout != undefined) {
        this.config.options.requestTimeout = config.options.requestTimeout;
      }

      if (config.options.maxRetriesOnTransientErrors != undefined) {
        if (!Number.isInteger(config.options.maxRetriesOnTransientErrors) || config.options.maxRetriesOnTransientErrors < 0) {
          throw new RangeError('options.maxRetriesOnTransientErrors must be a non-negative integer.');
        }

        this.config.options.maxRetriesOnTransientErrors = config.options.maxRetriesOnTransientErrors;
      }

      if (config.options.connectionRetryInterval != undefined) {
        if (!Number.isInteger(config.options.connectionRetryInterval) || config.options.connectionRetryInterval <= 0) {
          throw new TypeError('options.connectionRetryInterval must be a non-zero positive integer.');
        }

        this.config.options.connectionRetryInterval = config.options.connectionRetryInterval;
      }

      if (config.options.rowCollectionOnDone != undefined) {
        this.config.options.rowCollectionOnDone = config.options.rowCollectionOnDone;
      }

      if (config.options.rowCollectionOnRequestCompletion != undefined) {
        this.config.options.rowCollectionOnRequestCompletion = config.options.rowCollectionOnRequestCompletion;
      }

      if (config.options.tdsVersion) {
        this.config.options.tdsVersion = config.options.tdsVersion;
      }

      if (config.options.textsize) {
        this.config.options.textsize = config.options.textsize;
      }

      if (config.options.trustServerCertificate != undefined) {
        this.config.options.trustServerCertificate = config.options.trustServerCertificate;
      }

      if (config.options.useColumnNames != undefined) {
        this.config.options.useColumnNames = config.options.useColumnNames;
      }

      if (config.options.useUTC != undefined) {
        this.config.options.useUTC = config.options.useUTC;
      }
    }

    if (this.config.domain && !this.config.userName && !this.config.password && SspiModuleSupported) {
      this.config.options.useWindowsIntegratedAuth = true;
    }

    this.reset = this.reset.bind(this);
    this.socketClose = this.socketClose.bind(this);
    this.socketEnd = this.socketEnd.bind(this);
    this.socketConnect = this.socketConnect.bind(this);
    this.socketError = this.socketError.bind(this);
    this.requestTimeout = this.requestTimeout.bind(this);
    this.connectTimeout = this.connectTimeout.bind(this);
    this.retryTimeout = this.retryTimeout.bind(this);
    this.createDebug();
    this.createTokenStreamParser();
    this.inTransaction = false;
    this.transactionDescriptors = [new Buffer([0, 0, 0, 0, 0, 0, 0, 0])];
    this.transitionTo(this.STATE.CONNECTING);
    this.sspiClientResponsePending = false;

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
    return this.transitionTo(this.STATE.FINAL);
  }

  initialiseConnection() {
    this.connect();
    return this.createConnectTimer();
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
      return this.loginError = null;
    }
  }

  createDebug() {
    this.debug = new Debug(this.config.options.debug);
    return this.debug.on('debug', (message) => {
      return this.emit('debug', message);
    });
  }

  createTokenStreamParser() {
    this.tokenStreamParser = new TokenStreamParser(this.debug, undefined, this.config.options);

    this.tokenStreamParser.on('infoMessage', (token) => {
      return this.emit('infoMessage', token);
    });

    this.tokenStreamParser.on('sspichallenge', (token) => {
      if (token.ntlmpacket) {
        this.ntlmpacket = token.ntlmpacket;
        this.ntlmpacketBuffer = token.ntlmpacketBuffer;
      }
      return this.emit('sspichallenge', token);
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
      return this.emit('databaseChange', token.newValue);
    });

    this.tokenStreamParser.on('languageChange', (token) => {
      return this.emit('languageChange', token.newValue);
    });

    this.tokenStreamParser.on('charsetChange', (token) => {
      return this.emit('charsetChange', token.newValue);
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
      return this.loggedIn = true;
    });

    this.tokenStreamParser.on('routingChange', (token) => {
      this.routingData = token.newValue;
      return this.dispatchEvent('routingChange');
    });

    this.tokenStreamParser.on('packetSizeChange', (token) => {
      return this.messageIo.packetSize(token.newValue);
    });

    // A new top-level transaction was started. This is not fired
    // for nested transactions.
    this.tokenStreamParser.on('beginTransaction', (token) => {
      this.transactionDescriptors.push(token.newValue);
      return this.inTransaction = true;
    });

    // A top-level transaction was committed. This is not fired
    // for nested transactions.
    this.tokenStreamParser.on('commitTransaction', () => {
      this.transactionDescriptors.length = 1;
      return this.inTransaction = false;
    });

    // A top-level transaction was rolled back. This is not fired
    // for nested transactions. This is also fired if a batch
    // aborting error happened that caused a rollback.
    this.tokenStreamParser.on('rollbackTransaction', () => {
      this.transactionDescriptors.length = 1;
      // An outermost transaction was rolled back. Reset the transaction counter
      this.inTransaction = false;
      return this.emit('rollbackTransaction');
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
        return this.request.emit('columnMetadata', columns);
      } else {
        this.emit('error', new Error("Received 'columnMetadata' when no sqlRequest is in progress"));
        return this.close();
      }
    });

    this.tokenStreamParser.on('order', (token) => {
      if (this.request) {
        return this.request.emit('order', token.orderColumns);
      } else {
        this.emit('error', new Error("Received 'order' when no sqlRequest is in progress"));
        return this.close();
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
        return this.request.emit('row', token.columns);
      } else {
        this.emit('error', new Error("Received 'row' when no sqlRequest is in progress"));
        return this.close();
      }
    });

    this.tokenStreamParser.on('returnStatus', (token) => {
      if (this.request) {
        // Keep value for passing in 'doneProc' event.
        return this.procReturnStatusValue = token.value;
      }
    });

    this.tokenStreamParser.on('returnValue', (token) => {
      if (this.request) {
        return this.request.emit('returnValue', token.paramName, token.value, token.metadata);
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
          return this.request.rst = [];
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
          return this.request.rst = [];
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
          return this.request.rst = [];
        }
      }
    });

    this.tokenStreamParser.on('resetConnection', () => {
      return this.emit('resetConnection');
    });

    this.tokenStreamParser.on('tokenStreamError', (error) => {
      this.emit('error', error);
      return this.close();
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
          return this.emit('connect', ConnectionError(message, 'EINSTLOOKUP'));
        } else {
          return this.connectOnPort(port, this.config.options.multiSubnetFailover);
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

      this.socket = socket;
      this.socket.on('error', this.socketError);
      this.socket.on('close', this.socketClose);
      this.socket.on('end', this.socketEnd);
      this.messageIo = new MessageIO(this.socket, this.config.options.packetSize, this.debug);
      this.messageIo.on('data', (data) => { this.dispatchEvent('data', data); });
      this.messageIo.on('message', () => { this.dispatchEvent('message'); });
      this.messageIo.on('secure', this.emit.bind(this, 'secure'));

      this.socketConnect();
    });
  }

  closeConnection() {
    if (this.socket) {
      this.socket.destroy();
    }
  }

  createConnectTimer() {
    return this.connectTimer = setTimeout(this.connectTimeout, this.config.options.connectTimeout);
  }

  createRequestTimer() {
    this.clearRequestTimer();                              // release old timer, just to be safe
    if (this.config.options.requestTimeout) {
      return this.requestTimer = setTimeout(this.requestTimeout, this.config.options.requestTimeout);
    }
  }

  createRetryTimer() {
    this.clearRetryTimer();
    this.retryTimer = setTimeout(this.retryTimeout, this.config.options.connectionRetryInterval);
  }

  connectTimeout() {
    const message = 'Failed to connect to ' + this.config.server + ':' + this.config.options.port + ' in ' + this.config.options.connectTimeout + 'ms';
    this.debug.log(message);
    this.emit('connect', ConnectionError(message, 'ETIMEOUT'));
    this.connectTimer = undefined;
    return this.dispatchEvent('connectTimeout');
  }

  requestTimeout() {
    this.requestTimer = undefined;
    this.messageIo.sendMessage(TYPE.ATTENTION);
    return this.transitionTo(this.STATE.SENT_ATTENTION);
  }

  retryTimeout() {
    this.retryTimer = undefined;
    this.emit('retry');
    this.transitionTo(this.STATE.CONNECTING);
  }

  clearConnectTimer() {
    if (this.connectTimer) {
      return clearTimeout(this.connectTimer);
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
      this.state.exit.apply(this);
    }

    this.debug.log('State change: ' + (this.state ? this.state.name : undefined) + ' -> ' + newState.name);
    this.state = newState;

    if (this.state.enter) {
      return this.state.enter.apply(this);
    }
  }

  dispatchEvent(eventName) {
    if (this.state.events[eventName]) {
      const args = new Array(arguments.length - 1);
      for (let i = 0; i < args.length;) {
        args[i++] = arguments[i];
      }
      return this.state.events[eventName].apply(this, args);
    } else {
      this.emit('error', new Error(`No event '${eventName}' in state '${this.state.name}'`));
      return this.close();
    }
  }

  socketError(error) {
    if (this.state === this.STATE.CONNECTING) {
      const message = `Failed to connect to ${this.config.server}:${this.config.options.port} - ${error.message}`;
      this.debug.log(message);
      this.emit('connect', ConnectionError(message, 'ESOCKET'));
    } else {
      const message = `Connection lost - ${error.message}`;
      this.debug.log(message);
      this.emit('error', ConnectionError(message, 'ESOCKET'));
    }
    return this.dispatchEvent('socketError', error);
  }

  socketConnect() {
    this.socket.setKeepAlive(true, KEEP_ALIVE_INITIAL_DELAY);
    this.closed = false;
    this.debug.log('connected to ' + this.config.server + ':' + this.config.options.port);
    return this.dispatchEvent('socketConnect');
  }

  socketEnd() {
    this.debug.log('socket ended');
    return this.transitionTo(this.STATE.FINAL);
  }

  socketClose() {
    this.debug.log('connection to ' + this.config.server + ':' + this.config.options.port + ' closed');
    if (this.state === this.STATE.REROUTING) {
      this.debug.log('Rerouting to ' + this.routingData.server + ':' + this.routingData.port);
      return this.dispatchEvent('reconnect');
    } else if (this.state === this.STATE.TRANSIENT_FAILURE_RETRY) {
      const server = this.routingData ? this.routingData.server : this.server;
      const port = this.routingData ? this.routingData.port : this.config.options.port;
      this.debug.log('Retry after transient failure connecting to ' + server + ':' + port);

      return this.dispatchEvent('retry');
    } else {
      return this.transitionTo(this.STATE.FINAL);
    }
  }

  sendPreLogin() {
    const payload = new PreloginPayload({
      encrypt: this.config.options.encrypt
    });
    this.messageIo.sendMessage(TYPE.PRELOGIN, payload.data);
    return this.debug.payload(function() {
      return payload.toString('  ');
    });
  }

  emptyMessageBuffer() {
    return this.messageBuffer = new Buffer(0);
  }

  addToMessageBuffer(data) {
    return this.messageBuffer = Buffer.concat([this.messageBuffer, data]);
  }

  processPreLoginResponse() {
    const preloginPayload = new PreloginPayload(this.messageBuffer);
    this.debug.payload(function() {
      return preloginPayload.toString('  ');
    });

    if (preloginPayload.encryptionString === 'ON' || preloginPayload.encryptionString === 'REQ') {
      if (!this.config.options.encrypt) {
        this.emit('connect', ConnectionError("Server requires encryption, set 'encrypt' config option to true.", 'EENCRYPT'));
        return this.close();
      }

      return this.dispatchEvent('tls');
    } else {
      return this.dispatchEvent('noTls');
    }
  }

  sendLogin7Packet(cb) {
    const sendPayload = function(clientResponse) {
      const payload = new Login7Payload({
        domain: this.config.domain,
        userName: this.config.userName,
        password: this.config.password,
        database: this.config.options.database,
        serverName: this.routingData ? this.routingData.server : this.config.server,
        appName: this.config.options.appName,
        packetSize: this.config.options.packetSize,
        tdsVersion: this.config.options.tdsVersion,
        initDbFatal: !this.config.options.fallbackToDefaultDb,
        readOnlyIntent: this.config.options.readOnlyIntent,
        sspiBlob: clientResponse,
        language: this.config.options.language
      });

      this.routingData = undefined;
      this.messageIo.sendMessage(TYPE.LOGIN7, payload.data);

      this.debug.payload(function() {
        return payload.toString('  ');
      });
    };

    if (this.config.options.useWindowsIntegratedAuth) {
      Fqdn.getFqdn(this.routingData ? this.routingData.server : this.config.server, (err, fqdn) => {
        if (err) {
          this.emit('error', new Error('Error getting Fqdn. Error details: ' + err.message));
          return this.close();
        }

        const spn = MakeSpn.makeSpn('MSSQLSvc', fqdn, this.config.options.port);

        this.sspiClient = new SspiClientApi.SspiClient(spn, this.config.securityPackage);

        this.sspiClientResponsePending = true;
        this.sspiClient.getNextBlob(null, 0, 0, (clientResponse, isDone, errorCode, errorString) => {
          if (errorCode) {
            this.emit('error', new Error(errorString));
            return this.close();
          }

          if (isDone) {
            this.emit('error', new Error('Unexpected isDone=true on getNextBlob in sendLogin7Packet.'));
            return this.close();
          }

          this.sspiClientResponsePending = false;
          sendPayload.call(this, clientResponse);
          cb();
        });
      });
    } else {
      sendPayload.call(this);
      process.nextTick(cb);
    }
  }

  sendNTLMResponsePacket() {
    if (this.sspiClient) {
      this.sspiClientResponsePending = true;

      this.sspiClient.getNextBlob(this.ntlmpacketBuffer, 0, this.ntlmpacketBuffer.length, (clientResponse, isDone, errorCode, errorString) => {

        if (errorCode) {
          this.emit('error', new Error(errorString));
          return this.close();
        }

        this.sspiClientResponsePending = false;

        if (clientResponse.length) {
          this.messageIo.sendMessage(TYPE.NTLMAUTH_PKT, clientResponse);
          this.debug.payload(function() {
            return '  SSPI Auth';
          });
        }

        if (isDone) {
          this.transitionTo(this.STATE.SENT_NTLM_RESPONSE);
        }
      });
    } else {
      const payload = new NTLMResponsePayload({
        domain: this.config.domain,
        userName: this.config.userName,
        password: this.config.password,
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

      const boundTransitionTo = this.transitionTo.bind(this);
      process.nextTick(boundTransitionTo, this.STATE.SENT_NTLM_RESPONSE);
    }
  }

  sendDataToTokenStreamParser(data) {
    return this.tokenStreamParser.addBuffer(data);
  }

  sendInitialSql() {
    const payload = new SqlBatchPayload(this.getInitialSql(), this.currentTransactionDescriptor(), this.config.options);
    return this.messageIo.sendMessage(TYPE.SQL_BATCH, payload.data);
  }

  getInitialSql() {
    const enableAnsiNull = this.config.options.enableAnsiNull ? 'on' : 'off';
    const enableAnsiNullDefault = this.config.options.enableAnsiNullDefault ? 'on' : 'off';
    const enableAnsiPadding = this.config.options.enableAnsiPadding ? 'on' : 'off';
    const enableAnsiWarnings = this.config.options.enableAnsiWarnings ? 'on' : 'off';
    const enableArithAbort = this.config.options.enableArithAbort ? 'on' : 'off';
    const enableConcatNullYieldsNull = this.config.options.enableConcatNullYieldsNull ? 'on' : 'off';
    const enableCursorCloseOnCommit = this.config.options.enableCursorCloseOnCommit ? 'on' : 'off';
    const enableImplicitTransactions = this.config.options.enableImplicitTransactions ? 'on' : 'off';
    const enableNumericRoundabort = this.config.options.enableNumericRoundabort ? 'on' : 'off';
    const enableQuotedIdentifier = this.config.options.enableQuotedIdentifier ? 'on' : 'off';
    const xact_abort = this.config.options.abortTransactionOnError ? 'on' : 'off';

    return `set ansi_nulls ${enableAnsiNull}\n
      set ansi_null_dflt_on ${enableAnsiNullDefault}\n
      set ansi_padding ${enableAnsiPadding}\n 
      set ansi_warnings ${enableAnsiWarnings}\n
      set arithabort ${enableArithAbort}\n
      set concat_null_yields_null ${enableConcatNullYieldsNull}\n
      set cursor_close_on_commit ${enableCursorCloseOnCommit}\n
      set datefirst ${this.config.options.datefirst}\n
      set dateformat ${this.config.options.dateFormat}\n
      set implicit_transactions ${enableImplicitTransactions}\n
      set language ${this.config.options.language}\n
      set numeric_roundabort ${enableNumericRoundabort}\n
      set quoted_identifier ${enableQuotedIdentifier}\n
      set textsize ${this.config.options.textsize}\n
      set transaction isolation level ${this.getIsolationLevelText(this.config.options.connectionIsolationLevel)}\n
      set xact_abort ${xact_abort}`;
  }

  processedInitialSql() {
    this.clearConnectTimer();
    return this.emit('connect');
  }

  processLogin7Response() {
    if (this.loggedIn) {
      return this.dispatchEvent('loggedIn');
    } else {
      if (this.loginError) {
        this.emit('connect', this.loginError);
      } else {
        this.emit('connect', ConnectionError('Login failed.', 'ELOGIN'));
      }
      return this.dispatchEvent('loginFailed');
    }
  }

  processLogin7NTLMResponse() {
    if (this.ntlmpacket) {
      return this.dispatchEvent('receivedChallenge');
    } else {
      if (this.loginError) {
        this.emit('connect', this.loginError);
      } else {
        this.emit('connect', ConnectionError('Login failed.', 'ELOGIN'));
      }
      return this.dispatchEvent('loginFailed');
    }
  }

  processLogin7NTLMAck() {
    if (this.loggedIn) {
      return this.dispatchEvent('loggedIn');
    } else {
      if (this.loginError) {
        this.emit('connect', this.loginError);
      } else {
        this.emit('connect', ConnectionError('Login failed.', 'ELOGIN'));
      }
      return this.dispatchEvent('loginFailed');
    }
  }

  execSqlBatch(request) {
    return this.makeRequest(request, TYPE.SQL_BATCH, new SqlBatchPayload(request.sqlTextOrProcedure, this.currentTransactionDescriptor(), this.config.options));
  }

  execSql(request) {
    request.transformIntoExecuteSqlRpc();
    if (request.error != null) {
      return process.nextTick(() => {
        this.debug.log(request.error.message);
        return request.callback(request.error);
      });
    }
    return this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  newBulkLoad(table, callback) {
    return new BulkLoad(table, this.config.options, callback);
  }

  execBulkLoad(bulkLoad) {
    const request = new Request(bulkLoad.getBulkInsertSql(), (error) => {
      if (error) {
        if (error.code === 'UNKNOWN') {
          error.message += ' This is likely because the schema of the BulkLoad does not match the schema of the table you are attempting to insert into.';
        }
        bulkLoad.error = error;
        return bulkLoad.callback(error);
      } else {
        return this.makeRequest(bulkLoad, TYPE.BULK_LOAD, bulkLoad.getPayload());
      }
    });
    return this.execSqlBatch(request);
  }

  prepare(request) {
    request.transformIntoPrepareRpc();
    return this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  unprepare(request) {
    request.transformIntoUnprepareRpc();
    return this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  execute(request, parameters) {
    request.transformIntoExecuteRpc(parameters);
    if (request.error != null) {
      return process.nextTick(() => {
        this.debug.log(request.error.message);
        return request.callback(request.error);
      });
    }
    return this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  callProcedure(request) {
    request.validateParameters();
    if (request.error != null) {
      return process.nextTick(() => {
        this.debug.log(request.error.message);
        return request.callback(request.error);
      });
    }
    return this.makeRequest(request, TYPE.RPC_REQUEST, new RpcRequestPayload(request, this.currentTransactionDescriptor(), this.config.options));
  }

  beginTransaction(callback, name, isolationLevel) {
    isolationLevel || (isolationLevel = this.config.options.isolationLevel);
    const transaction = new Transaction(name || '', isolationLevel);
    if (this.config.options.tdsVersion < '7_2') {
      const self = this;
      return this.execSqlBatch(new Request('SET TRANSACTION ISOLATION LEVEL ' + (transaction.isolationLevelToTSQL()) + ';BEGIN TRAN ' + transaction.name, function() {
        self.transactionDepth++;
        if (self.transactionDepth === 1) {
          self.inTransaction = true;
        }
        return callback.apply(null, arguments);
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
      const self = this;
      return this.execSqlBatch(new Request('COMMIT TRAN ' + transaction.name, function() {
        self.transactionDepth--;
        if (self.transactionDepth === 0) {
          self.inTransaction = false;
        }
        return callback.apply(null, arguments);
      }));
    }
    const request = new Request(undefined, callback);
    return this.makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.commitPayload(this.currentTransactionDescriptor()));
  }

  rollbackTransaction(callback, name) {
    const transaction = new Transaction(name || '');
    if (this.config.options.tdsVersion < '7_2') {
      const self = this;
      return this.execSqlBatch(new Request('ROLLBACK TRAN ' + transaction.name, function() {
        self.transactionDepth--;
        if (self.transactionDepth === 0) {
          self.inTransaction = false;
        }
        return callback.apply(null, arguments);
      }));
    }
    const request = new Request(undefined, callback);
    return this.makeRequest(request, TYPE.TRANSACTION_MANAGER, transaction.rollbackPayload(this.currentTransactionDescriptor()));
  }

  saveTransaction(callback, name) {
    const transaction = new Transaction(name);
    if (this.config.options.tdsVersion < '7_2') {
      const self = this;
      return this.execSqlBatch(new Request('SAVE TRAN ' + transaction.name, function() {
        self.transactionDepth++;
        return callback.apply(null, arguments);
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
    const self = this;
    const txDone = function(err, done) {
      const args = new Array(arguments.length - 2);
      for (let i = 0; i < args.length;) {
        args[i++] = arguments[i + 1];
      }

      if (err) {
        if (self.inTransaction && self.state === self.STATE.LOGGED_IN) {
          return self.rollbackTransaction(function(txErr) {
            args.unshift(txErr || err);
            return done.apply(null, args);
          }, name);
        } else {
          return process.nextTick(function() {
            args.unshift(err);
            return done.apply(null, args);
          });
        }
      } else {
        if (useSavepoint) {
          return process.nextTick(function() {
            if (self.config.options.tdsVersion < '7_2') {
              self.transactionDepth--;
            }
            args.unshift(null);
            return done.apply(null, args);
          });
        } else {
          return self.commitTransaction(function(txErr) {
            args.unshift(txErr);
            return done.apply(null, args);
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
          return this.execSqlBatch(new Request('SET transaction isolation level ' + this.getIsolationLevelText(isolationLevel), function(err) {
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
      return request.callback(RequestError(message, 'EINVALIDSTATE'));
    } else {
      if (packetType === TYPE.SQL_BATCH) {
        this.isSqlBatch = true;
      } else {
        this.isSqlBatch = false;
      }

      this.request = request;
      this.request.rowCount = 0;
      this.request.rows = [];
      this.request.rst = [];
      this.createRequestTimer();
      this.messageIo.sendMessage(packetType, payload.data, this.resetConnectionOnNextRequest);
      this.resetConnectionOnNextRequest = false;
      this.debug.payload(function() {
        return payload.toString('  ');
      });
      return this.transitionTo(this.STATE.SENT_CLIENT_REQUEST);
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
    const self = this;
    const request = new Request(this.getInitialSql(), function(err) {
      if (self.config.options.tdsVersion < '7_2') {
        self.inTransaction = false;
      }
      return callback(err);
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
      return this.initialiseConnection();
    },
    events: {
      socketError: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      socketConnect: function() {
        this.sendPreLogin();
        return this.transitionTo(this.STATE.SENT_PRELOGIN);
      }
    }
  },
  SENT_PRELOGIN: {
    name: 'SentPrelogin',
    enter: function() {
      return this.emptyMessageBuffer();
    },
    events: {
      socketError: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        return this.addToMessageBuffer(data);
      },
      message: function() {
        return this.processPreLoginResponse();
      },
      noTls: function() {
        this.sendLogin7Packet(() => {
          if (this.config.domain) {
            return this.transitionTo(this.STATE.SENT_LOGIN7_WITH_NTLM);
          } else {
            return this.transitionTo(this.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
          }
        });
      },
      tls: function() {
        this.messageIo.startTls(this.config.options.cryptoCredentialsDetails, this.config.server, this.config.options.trustServerCertificate);
        return this.transitionTo(this.STATE.SENT_TLSSSLNEGOTIATION);
      }
    }
  },
  REROUTING: {
    name: 'ReRouting',
    enter: function() {
      return this.cleanupConnection(this.cleanupTypeEnum.REDIRECT);
    },
    events: {
      message: function() {},
      socketError: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      reconnect: function() {
        return this.transitionTo(this.STATE.CONNECTING);
      }
    }
  },
  TRANSIENT_FAILURE_RETRY: {
    name: 'TRANSIENT_FAILURE_RETRY',
    enter: function() {
      this.curTransientRetryCount++;
      return this.cleanupConnection(this.cleanupTypeEnum.RETRY);
    },
    events: {
      message: function() {},
      socketError: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        return this.transitionTo(this.STATE.FINAL);
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
        return this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        return this.messageIo.tlsHandshakeData(data);
      },
      message: function() {
        if (this.messageIo.tlsNegotiationComplete) {
          this.sendLogin7Packet(() => {
            if (this.config.domain) {
              return this.transitionTo(this.STATE.SENT_LOGIN7_WITH_NTLM);
            } else {
              return this.transitionTo(this.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
            }
          });
        }
      }
    }
  },
  SENT_LOGIN7_WITH_STANDARD_LOGIN: {
    name: 'SentLogin7WithStandardLogin',
    events: {
      socketError: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        return this.sendDataToTokenStreamParser(data);
      },
      loggedIn: function() {
        return this.transitionTo(this.STATE.LOGGED_IN_SENDING_INITIAL_SQL);
      },
      routingChange: function() {
        return this.transitionTo(this.STATE.REROUTING);
      },
      loginFailed: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      message: function() {
        return this.processLogin7Response();
      }
    }
  },
  SENT_LOGIN7_WITH_NTLM: {
    name: 'SentLogin7WithNTLMLogin',
    events: {
      socketError: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        if (this.sspiClientResponsePending) {
          // We got data from the server while we're waiting for getNextBlob()
          // call to complete on the client. We cannot process server data
          // until this call completes as the state can change on completion of
          // the call. Queue it for later.
          const boundDispatchEvent = this.dispatchEvent.bind(this);
          return setImmediate(boundDispatchEvent, 'data', data);
        } else {
          return this.sendDataToTokenStreamParser(data);
        }
      },
      receivedChallenge: function() {
        return this.sendNTLMResponsePacket();
      },
      loginFailed: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      message: function() {
        if (this.sspiClientResponsePending) {
          // We got data from the server while we're waiting for getNextBlob()
          // call to complete on the client. We cannot process server data
          // until this call completes as the state can change on completion of
          // the call. Queue it for later.
          const boundDispatchEvent = this.dispatchEvent.bind(this);
          return setImmediate(boundDispatchEvent, 'message');
        } else {
          return this.processLogin7NTLMResponse();
        }
      }
    }
  },
  SENT_NTLM_RESPONSE: {
    name: 'SentNTLMResponse',
    events: {
      socketError: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        return this.sendDataToTokenStreamParser(data);
      },
      loggedIn: function() {
        return this.transitionTo(this.STATE.LOGGED_IN_SENDING_INITIAL_SQL);
      },
      loginFailed: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      routingChange: function() {
        return this.transitionTo(this.STATE.REROUTING);
      },
      message: function() {
        return this.processLogin7NTLMAck();
      }
    }
  },
  LOGGED_IN_SENDING_INITIAL_SQL: {
    name: 'LoggedInSendingInitialSql',
    enter: function() {
      return this.sendInitialSql();
    },
    events: {
      connectTimeout: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        return this.sendDataToTokenStreamParser(data);
      },
      message: function() {
        this.transitionTo(this.STATE.LOGGED_IN);
        return this.processedInitialSql();
      }
    }
  },
  LOGGED_IN: {
    name: 'LoggedIn',
    events: {
      socketError: function() {
        return this.transitionTo(this.STATE.FINAL);
      }
    }
  },
  SENT_CLIENT_REQUEST: {
    name: 'SentClientRequest',
    exit: function() {
      this.clearRequestTimer();
    },
    events: {
      socketError: function(err) {
        const sqlRequest = this.request;
        this.request = undefined;
        sqlRequest.callback(err);
        return this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        this.clearRequestTimer();                          // request timer is stopped on first data package
        return this.sendDataToTokenStreamParser(data);
      },
      message: function() {
        this.transitionTo(this.STATE.LOGGED_IN);
        const sqlRequest = this.request;
        this.request = undefined;
        if (this.config.options.tdsVersion < '7_2' && sqlRequest.error && this.isSqlBatch) {
          this.inTransaction = false;
        }
        return sqlRequest.callback(sqlRequest.error, sqlRequest.rowCount, sqlRequest.rows);
      }
    }
  },
  SENT_ATTENTION: {
    name: 'SentAttention',
    enter: function() {
      return this.attentionReceived = false;
    },
    events: {
      socketError: function() {
        return this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        return this.sendDataToTokenStreamParser(data);
      },
      attention: function() {
        return this.attentionReceived = true;
      },
      message: function() {
        // 3.2.5.7 Sent Attention State
        // Discard any data contained in the response, until we receive the attention response
        if (this.attentionReceived) {
          const sqlRequest = this.request;
          this.request = undefined;
          this.transitionTo(this.STATE.LOGGED_IN);
          if (sqlRequest.canceled) {
            return sqlRequest.callback(RequestError('Canceled.', 'ECANCEL'));
          } else {
            const message = 'Timeout: Request failed to complete in ' + this.config.options.requestTimeout + 'ms';
            return sqlRequest.callback(RequestError(message, 'ETIMEOUT'));
          }
        }
      }
    }
  },
  FINAL: {
    name: 'Final',
    enter: function() {
      return this.cleanupConnection(this.cleanupTypeEnum.NORMAL);
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
