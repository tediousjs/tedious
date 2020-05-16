/* eslint-disable @typescript-eslint/no-inferrable-types */
import constants from 'constants';
import { SecureContextOptions } from 'tls';
import { Metadata } from './metadata-parser';
import { ISOLATION_LEVEL, assertValidIsolationLevel } from './transaction';
import depd from 'depd';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const deprecate = depd('tedious');

export interface ConnectionOptions {
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

export class InternalConnectionOptions {
  abortTransactionOnError: boolean = false;
  appName: undefined | string = undefined;
  camelCaseColumns: boolean = false;
  cancelTimeout: number = DEFAULT_CANCEL_TIMEOUT;
  columnNameReplacer: undefined | ((colName: string, index: number, metadata: Metadata) => string) = undefined;
  connectionRetryInterval: number = DEFAULT_CONNECT_RETRY_INTERVAL;
  connectTimeout: number = DEFAULT_CONNECT_TIMEOUT;
  connectionIsolationLevel: typeof ISOLATION_LEVEL[keyof typeof ISOLATION_LEVEL] = ISOLATION_LEVEL.READ_COMMITTED;
  cryptoCredentialsDetails: SecureContextOptions = {};
  database: undefined | string = undefined;
  datefirst: number = DEFAULT_DATEFIRST;
  dateFormat: string = DEFAULT_DATEFORMAT;
  debug: {
    data: boolean;
    packet: boolean;
    payload: boolean;
    token: boolean;
  } = {
    data: false,
    packet: false,
    payload: false,
    token: false
  };
  enableAnsiNull: null | boolean = true;
  enableAnsiNullDefault: null | boolean = true;
  enableAnsiPadding: null | boolean = true;
  enableAnsiWarnings: null | boolean = true;
  enableArithAbort: null | boolean = true;
  enableConcatNullYieldsNull: null | boolean = true;
  enableCursorCloseOnCommit: null | boolean = null;
  enableImplicitTransactions: null | boolean = false;
  enableNumericRoundabort: null | boolean = false;
  enableQuotedIdentifier: null | boolean = true;
  encrypt: boolean = true;
  fallbackToDefaultDb: boolean = false;
  instanceName: undefined | string = undefined;
  isolationLevel: typeof ISOLATION_LEVEL[keyof typeof ISOLATION_LEVEL] = ISOLATION_LEVEL.READ_COMMITTED;
  language: string = DEFAULT_LANGUAGE;
  localAddress: undefined | string = undefined;
  maxRetriesOnTransientErrors: number = 3;
  multiSubnetFailover: boolean = false;
  packetSize: number = DEFAULT_PACKET_SIZE;
  port: undefined | number = DEFAULT_PORT;
  readOnlyIntent: boolean = false;
  requestTimeout: number = DEFAULT_CLIENT_REQUEST_TIMEOUT;
  rowCollectionOnDone: boolean = false;
  rowCollectionOnRequestCompletion: boolean = false;
  tdsVersion: string = DEFAULT_TDS_VERSION;
  textsize: string = DEFAULT_TEXTSIZE;
  trustServerCertificate: boolean = true;
  useColumnNames: boolean = false;
  useUTC: boolean = true;
  lowerCaseGuids: boolean = false;

  constructor(options: ConnectionOptions = {}) {
    if (options.port && options.instanceName) {
      throw new Error('Port and instanceName are mutually exclusive, but ' + options.port + ' and ' + options.instanceName + ' provided');
    }

    if (options.abortTransactionOnError !== undefined) {
      if (typeof options.abortTransactionOnError !== 'boolean' && options.abortTransactionOnError !== null) {
        throw new TypeError('The "config.options.abortTransactionOnError" property must be of type string or null.');
      }

      this.abortTransactionOnError = options.abortTransactionOnError;
    }

    if (options.appName !== undefined) {
      if (typeof options.appName !== 'string') {
        throw new TypeError('The "config.options.appName" property must be of type string.');
      }

      this.appName = options.appName;
    }

    if (options.camelCaseColumns !== undefined) {
      if (typeof options.camelCaseColumns !== 'boolean') {
        throw new TypeError('The "config.options.camelCaseColumns" property must be of type boolean.');
      }

      this.camelCaseColumns = options.camelCaseColumns;
    }

    if (options.cancelTimeout !== undefined) {
      if (typeof options.cancelTimeout !== 'number') {
        throw new TypeError('The "config.options.cancelTimeout" property must be of type number.');
      }

      this.cancelTimeout = options.cancelTimeout;
    }

    if (options.columnNameReplacer) {
      if (typeof options.columnNameReplacer !== 'function') {
        throw new TypeError('The "config.options.cancelTimeout" property must be of type function.');
      }

      this.columnNameReplacer = options.columnNameReplacer;
    }

    if (options.connectTimeout !== undefined) {
      if (typeof options.connectTimeout !== 'number') {
        throw new TypeError('The "config.options.connectTimeout" property must be of type number.');
      }

      this.connectTimeout = options.connectTimeout;
    }

    if (options.connectionIsolationLevel !== undefined) {
      assertValidIsolationLevel(options.connectionIsolationLevel, 'options.connectionIsolationLevel');

      this.connectionIsolationLevel = options.connectionIsolationLevel;
    }

    if (options.connectTimeout !== undefined) {
      if (typeof options.connectTimeout !== 'number') {
        throw new TypeError('The "config.options.connectTimeout" property must be of type number.');
      }

      this.connectTimeout = options.connectTimeout;
    }

    if (options.cryptoCredentialsDetails !== undefined) {
      if (typeof options.cryptoCredentialsDetails !== 'object' || options.cryptoCredentialsDetails === null) {
        throw new TypeError('The "config.options.cryptoCredentialsDetails" property must be of type Object.');
      }

      this.cryptoCredentialsDetails = options.cryptoCredentialsDetails;
    }

    let credentialsDetails = this.cryptoCredentialsDetails;
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

    if (options.database !== undefined) {
      if (typeof options.database !== 'string') {
        throw new TypeError('The "config.options.database" property must be of type string.');
      }

      this.database = options.database;
    }

    if (options.datefirst !== undefined) {
      if (typeof options.datefirst !== 'number' && options.datefirst !== null) {
        throw new TypeError('The "config.options.datefirst" property must be of type number.');
      }

      if (options.datefirst !== null && (options.datefirst < 1 || options.datefirst > 7)) {
        throw new RangeError('The "config.options.datefirst" property must be >= 1 and <= 7');
      }

      this.datefirst = options.datefirst;
    }

    if (options.dateFormat !== undefined) {
      if (typeof options.dateFormat !== 'string' && options.dateFormat !== null) {
        throw new TypeError('The "config.options.dateFormat" property must be of type string or null.');
      }

      this.dateFormat = options.dateFormat;
    }

    if (options.debug) {
      if (options.debug.data !== undefined) {
        if (typeof options.debug.data !== 'boolean') {
          throw new TypeError('The "config.options.debug.data" property must be of type boolean.');
        }

        this.debug.data = options.debug.data;
      }

      if (options.debug.packet !== undefined) {
        if (typeof options.debug.packet !== 'boolean') {
          throw new TypeError('The "config.options.debug.packet" property must be of type boolean.');
        }

        this.debug.packet = options.debug.packet;
      }

      if (options.debug.payload !== undefined) {
        if (typeof options.debug.payload !== 'boolean') {
          throw new TypeError('The "config.options.debug.payload" property must be of type boolean.');
        }

        this.debug.payload = options.debug.payload;
      }

      if (options.debug.token !== undefined) {
        if (typeof options.debug.token !== 'boolean') {
          throw new TypeError('The "config.options.debug.token" property must be of type boolean.');
        }

        this.debug.token = options.debug.token;
      }
    }

    if (options.enableAnsiNull !== undefined) {
      if (typeof options.enableAnsiNull !== 'boolean' && options.enableAnsiNull !== null) {
        throw new TypeError('The "config.options.enableAnsiNull" property must be of type boolean or null.');
      }

      this.enableAnsiNull = options.enableAnsiNull;
    }

    if (options.enableAnsiNullDefault !== undefined) {
      if (typeof options.enableAnsiNullDefault !== 'boolean' && options.enableAnsiNullDefault !== null) {
        throw new TypeError('The "config.options.enableAnsiNullDefault" property must be of type boolean or null.');
      }

      this.enableAnsiNullDefault = options.enableAnsiNullDefault;
    }

    if (options.enableAnsiPadding !== undefined) {
      if (typeof options.enableAnsiPadding !== 'boolean' && options.enableAnsiPadding !== null) {
        throw new TypeError('The "config.options.enableAnsiPadding" property must be of type boolean or null.');
      }

      this.enableAnsiPadding = options.enableAnsiPadding;
    }

    if (options.enableAnsiWarnings !== undefined) {
      if (typeof options.enableAnsiWarnings !== 'boolean' && options.enableAnsiWarnings !== null) {
        throw new TypeError('The "config.options.enableAnsiWarnings" property must be of type boolean or null.');
      }

      this.enableAnsiWarnings = options.enableAnsiWarnings;
    }

    if (options.enableArithAbort !== undefined) {
      if (typeof options.enableArithAbort !== 'boolean' && options.enableArithAbort !== null) {
        throw new TypeError('The "config.options.enableArithAbort" property must be of type boolean or null.');
      }

      this.enableArithAbort = options.enableArithAbort;
    }

    if (options.enableConcatNullYieldsNull !== undefined) {
      if (typeof options.enableConcatNullYieldsNull !== 'boolean' && options.enableConcatNullYieldsNull !== null) {
        throw new TypeError('The "config.options.enableConcatNullYieldsNull" property must be of type boolean or null.');
      }

      this.enableConcatNullYieldsNull = options.enableConcatNullYieldsNull;
    }

    if (options.enableCursorCloseOnCommit !== undefined) {
      if (typeof options.enableCursorCloseOnCommit !== 'boolean' && options.enableCursorCloseOnCommit !== null) {
        throw new TypeError('The "config.options.enableCursorCloseOnCommit" property must be of type boolean or null.');
      }

      this.enableCursorCloseOnCommit = options.enableCursorCloseOnCommit;
    }

    if (options.enableImplicitTransactions !== undefined) {
      if (typeof options.enableImplicitTransactions !== 'boolean' && options.enableImplicitTransactions !== null) {
        throw new TypeError('The "config.options.enableImplicitTransactions" property must be of type boolean or null.');
      }

      this.enableImplicitTransactions = options.enableImplicitTransactions;
    }

    if (options.enableNumericRoundabort !== undefined) {
      if (typeof options.enableNumericRoundabort !== 'boolean' && options.enableNumericRoundabort !== null) {
        throw new TypeError('The "config.options.enableNumericRoundabort" property must be of type boolean or null.');
      }

      this.enableNumericRoundabort = options.enableNumericRoundabort;
    }

    if (options.enableQuotedIdentifier !== undefined) {
      if (typeof options.enableQuotedIdentifier !== 'boolean' && options.enableQuotedIdentifier !== null) {
        throw new TypeError('The "config.options.enableQuotedIdentifier" property must be of type boolean or null.');
      }

      this.enableQuotedIdentifier = options.enableQuotedIdentifier;
    }

    if (options.encrypt !== undefined) {
      if (typeof options.encrypt !== 'boolean') {
        throw new TypeError('The "config.options.encrypt" property must be of type boolean.');
      }

      this.encrypt = options.encrypt;
    }

    if (options.fallbackToDefaultDb !== undefined) {
      if (typeof options.fallbackToDefaultDb !== 'boolean') {
        throw new TypeError('The "config.options.fallbackToDefaultDb" property must be of type boolean.');
      }

      this.fallbackToDefaultDb = options.fallbackToDefaultDb;
    }

    if (options.instanceName !== undefined) {
      if (typeof options.instanceName !== 'string') {
        throw new TypeError('The "config.options.instanceName" property must be of type string.');
      }

      this.instanceName = options.instanceName;
      this.port = undefined;
    }

    if (options.isolationLevel !== undefined) {
      assertValidIsolationLevel(options.isolationLevel, 'options.isolationLevel');

      this.isolationLevel = options.isolationLevel;
    }

    if (options.language !== undefined) {
      if (typeof options.language !== 'string' && options.language !== null) {
        throw new TypeError('The "config.options.language" property must be of type string or null.');
      }

      this.language = options.language;
    }

    if (options.localAddress !== undefined) {
      if (typeof options.localAddress !== 'string') {
        throw new TypeError('The "config.options.localAddress" property must be of type string.');
      }

      this.localAddress = options.localAddress;
    }

    if (options.multiSubnetFailover !== undefined) {
      if (typeof options.multiSubnetFailover !== 'boolean') {
        throw new TypeError('The "config.options.multiSubnetFailover" property must be of type boolean.');
      }

      this.multiSubnetFailover = options.multiSubnetFailover;
    }

    if (options.packetSize !== undefined) {
      if (typeof options.packetSize !== 'number') {
        throw new TypeError('The "config.options.packetSize" property must be of type number.');
      }

      this.packetSize = options.packetSize;
    }

    if (options.port !== undefined) {
      if (typeof options.port !== 'number') {
        throw new TypeError('The "config.options.port" property must be of type number.');
      }

      if (options.port <= 0 || options.port >= 65536) {
        throw new RangeError('The "config.options.port" property must be > 0 and < 65536');
      }

      this.port = options.port;
      this.instanceName = undefined;
    }

    if (options.readOnlyIntent !== undefined) {
      if (typeof options.readOnlyIntent !== 'boolean') {
        throw new TypeError('The "config.options.readOnlyIntent" property must be of type boolean.');
      }

      this.readOnlyIntent = options.readOnlyIntent;
    }

    if (options.requestTimeout !== undefined) {
      if (typeof options.requestTimeout !== 'number') {
        throw new TypeError('The "config.options.requestTimeout" property must be of type number.');
      }

      this.requestTimeout = options.requestTimeout;
    }

    if (options.maxRetriesOnTransientErrors !== undefined) {
      if (typeof options.maxRetriesOnTransientErrors !== 'number') {
        throw new TypeError('The "config.options.maxRetriesOnTransientErrors" property must be of type number.');
      }

      if (options.maxRetriesOnTransientErrors < 0) {
        throw new TypeError('The "config.options.maxRetriesOnTransientErrors" property must be equal or greater than 0.');
      }

      this.maxRetriesOnTransientErrors = options.maxRetriesOnTransientErrors;
    }

    if (options.connectionRetryInterval !== undefined) {
      if (typeof options.connectionRetryInterval !== 'number') {
        throw new TypeError('The "config.options.connectionRetryInterval" property must be of type number.');
      }

      if (options.connectionRetryInterval <= 0) {
        throw new TypeError('The "config.options.connectionRetryInterval" property must be greater than 0.');
      }

      this.connectionRetryInterval = options.connectionRetryInterval;
    }

    if (options.rowCollectionOnDone !== undefined) {
      if (typeof options.rowCollectionOnDone !== 'boolean') {
        throw new TypeError('The "config.options.rowCollectionOnDone" property must be of type boolean.');
      }

      this.rowCollectionOnDone = options.rowCollectionOnDone;
    }

    if (options.rowCollectionOnRequestCompletion !== undefined) {
      if (typeof options.rowCollectionOnRequestCompletion !== 'boolean') {
        throw new TypeError('The "config.options.rowCollectionOnRequestCompletion" property must be of type boolean.');
      }

      this.rowCollectionOnRequestCompletion = options.rowCollectionOnRequestCompletion;
    }

    if (options.tdsVersion !== undefined) {
      if (typeof options.tdsVersion !== 'string') {
        throw new TypeError('The "config.options.tdsVersion" property must be of type string.');
      }

      this.tdsVersion = options.tdsVersion;
    }

    if (options.textsize !== undefined) {
      if (typeof options.textsize !== 'number' && options.textsize !== null) {
        throw new TypeError('The "config.options.textsize" property must be of type number or null.');
      }

      this.textsize = options.textsize;
    }

    if (options.trustServerCertificate !== undefined) {
      if (typeof options.trustServerCertificate !== 'boolean') {
        throw new TypeError('The "config.options.trustServerCertificate" property must be of type boolean.');
      }

      this.trustServerCertificate = options.trustServerCertificate;
    } else {
      deprecate('The default value for `config.options.trustServerCertificate` will change from `true` to `false` in the next major version of `tedious`. Set the value to `true` or `false` explicitly to silence this message.');
    }

    if (options.useColumnNames !== undefined) {
      if (typeof options.useColumnNames !== 'boolean') {
        throw new TypeError('The "config.options.useColumnNames" property must be of type boolean.');
      }

      this.useColumnNames = options.useColumnNames;
    }

    if (options.useUTC !== undefined) {
      if (typeof options.useUTC !== 'boolean') {
        throw new TypeError('The "config.options.useUTC" property must be of type boolean.');
      }

      this.useUTC = options.useUTC;
    }

    if (options.lowerCaseGuids !== undefined) {
      if (typeof options.lowerCaseGuids !== 'boolean') {
        throw new TypeError('The "config.options.lowerCaseGuids" property must be of type boolean.');
      }

      this.lowerCaseGuids = options.lowerCaseGuids;
    }
  }
}
