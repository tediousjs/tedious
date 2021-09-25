import { Collation } from '../collation';
import { Metadata } from '../metadata-parser';
import { ColumnMetadata } from './colmetadata-token-parser';
import { TokenHandler } from './handler';

export const TYPE = {
  ALTMETADATA: 0x88,
  ALTROW: 0xD3,
  COLMETADATA: 0x81,
  COLINFO: 0xA5,
  DONE: 0xFD,
  DONEPROC: 0xFE,
  DONEINPROC: 0xFF,
  ENVCHANGE: 0xE3,
  ERROR: 0xAA,
  FEATUREEXTACK: 0xAE,
  FEDAUTHINFO: 0xEE,
  INFO: 0xAB,
  LOGINACK: 0xAD,
  NBCROW: 0xD2,
  OFFSET: 0x78,
  ORDER: 0xA9,
  RETURNSTATUS: 0x79,
  RETURNVALUE: 0xAC,
  ROW: 0xD1,
  SSPI: 0xED,
  TABNAME: 0xA4
};

type HandlerName = keyof TokenHandler;

export abstract class Token {
  name: string;
  handlerName: keyof TokenHandler;

  constructor(name: string, handlerName: HandlerName) {
    this.name = name;
    this.handlerName = handlerName;
  }
}

export class ColMetadataToken extends Token {
  declare name: 'COLMETADATA';
  declare handlerName: 'onColMetadata';

  columns: ColumnMetadata[]

  constructor(columns: ColumnMetadata[]) {
    super('COLMETADATA', 'onColMetadata');

    this.columns = columns;
  }
}

export class DoneToken extends Token {
  declare name: 'DONE';
  declare handlerName: 'onDone';

  more: boolean;
  sqlError: boolean;
  attention: boolean;
  serverError: boolean;
  rowCount: number | undefined;
  curCmd: number;

  constructor({ more, sqlError, attention, serverError, rowCount, curCmd }: { more: boolean, sqlError: boolean, attention: boolean, serverError: boolean, rowCount: number | undefined, curCmd: number }) {
    super('DONE', 'onDone');

    this.more = more;
    this.sqlError = sqlError;
    this.attention = attention;
    this.serverError = serverError;
    this.rowCount = rowCount;
    this.curCmd = curCmd;
  }
}

export class DoneInProcToken extends Token {
  declare name: 'DONEINPROC';
  declare handlerName: 'onDoneInProc';

  more: boolean;
  sqlError: boolean;
  attention: boolean;
  serverError: boolean;
  rowCount: number | undefined;
  curCmd: number;

  constructor({ more, sqlError, attention, serverError, rowCount, curCmd }: { more: boolean, sqlError: boolean, attention: boolean, serverError: boolean, rowCount: number | undefined, curCmd: number }) {
    super('DONEINPROC', 'onDoneInProc');

    this.more = more;
    this.sqlError = sqlError;
    this.attention = attention;
    this.serverError = serverError;
    this.rowCount = rowCount;
    this.curCmd = curCmd;
  }
}

export class DoneProcToken extends Token {
  declare name: 'DONEPROC';
  declare handlerName: 'onDoneProc';

  more: boolean;
  sqlError: boolean;
  attention: boolean;
  serverError: boolean;
  rowCount: number | undefined;
  curCmd: number;

  constructor({ more, sqlError, attention, serverError, rowCount, curCmd }: { more: boolean, sqlError: boolean, attention: boolean, serverError: boolean, rowCount: number | undefined, curCmd: number }) {
    super('DONEPROC', 'onDoneProc');

    this.more = more;
    this.sqlError = sqlError;
    this.attention = attention;
    this.serverError = serverError;
    this.rowCount = rowCount;
    this.curCmd = curCmd;
  }
}

export class DatabaseEnvChangeToken extends Token {
  declare name: 'ENVCHANGE';
  declare handlerName: 'onDatabaseChange';

  type: 'DATABASE';
  newValue: string;
  oldValue: string;

  constructor(newValue: string, oldValue: string) {
    super('ENVCHANGE', 'onDatabaseChange');

    this.type = 'DATABASE';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class LanguageEnvChangeToken extends Token {
  declare name: 'ENVCHANGE';
  declare handlerName: 'onLanguageChange';

  type: 'LANGUAGE';
  newValue: string;
  oldValue: string;

  constructor(newValue: string, oldValue: string) {
    super('ENVCHANGE', 'onLanguageChange');

    this.type = 'LANGUAGE';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class CharsetEnvChangeToken extends Token {
  declare name: 'ENVCHANGE';
  declare handlerName: 'onCharsetChange';

  type: 'CHARSET';
  newValue: string;
  oldValue: string;

  constructor(newValue: string, oldValue: string) {
    super('ENVCHANGE', 'onCharsetChange');

    this.type = 'CHARSET';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class PacketSizeEnvChangeToken extends Token {
  declare name: 'ENVCHANGE';
  declare handlerName: 'onPacketSizeChange';

  type: 'PACKET_SIZE';
  newValue: number;
  oldValue: number;

  constructor(newValue: number, oldValue: number) {
    super('ENVCHANGE', 'onPacketSizeChange');

    this.type = 'PACKET_SIZE';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class BeginTransactionEnvChangeToken extends Token {
  declare name: 'ENVCHANGE';
  declare handlerName: 'onBeginTransaction';

  type: 'BEGIN_TXN';
  newValue: Buffer;
  oldValue: Buffer;

  constructor(newValue: Buffer, oldValue: Buffer) {
    super('ENVCHANGE', 'onBeginTransaction');

    this.type = 'BEGIN_TXN';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class CommitTransactionEnvChangeToken extends Token {
  declare name: 'ENVCHANGE';
  declare handlerName: 'onCommitTransaction';

  type: 'COMMIT_TXN';
  newValue: Buffer;
  oldValue: Buffer;

  constructor(newValue: Buffer, oldValue: Buffer) {
    super('ENVCHANGE', 'onCommitTransaction');

    this.type = 'COMMIT_TXN';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class RollbackTransactionEnvChangeToken extends Token {
  declare name: 'ENVCHANGE';
  declare handlerName: 'onRollbackTransaction';

  type: 'ROLLBACK_TXN';
  oldValue: Buffer;
  newValue: Buffer;

  constructor(newValue: Buffer, oldValue: Buffer) {
    super('ENVCHANGE', 'onRollbackTransaction');

    this.type = 'ROLLBACK_TXN';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class DatabaseMirroringPartnerEnvChangeToken extends Token {
  declare name: 'ENVCHANGE';
  declare handlerName: 'onDatabaseMirroringPartner';

  type: 'DATABASE_MIRRORING_PARTNER';
  oldValue: string;
  newValue: string;

  constructor(newValue: string, oldValue: string) {
    super('ENVCHANGE', 'onDatabaseMirroringPartner');

    this.type = 'DATABASE_MIRRORING_PARTNER';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class ResetConnectionEnvChangeToken extends Token {
  declare name: 'ENVCHANGE';
  declare handlerName: 'onResetConnection';

  type: 'RESET_CONNECTION';
  oldValue: Buffer;
  newValue: Buffer;

  constructor(newValue: Buffer, oldValue: Buffer) {
    super('ENVCHANGE', 'onResetConnection');

    this.type = 'RESET_CONNECTION';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class CollationChangeToken extends Token {
  declare name: 'ENVCHANGE';
  declare handlerName: 'onSqlCollationChange';

  type: 'SQL_COLLATION';
  oldValue: Collation | undefined;
  newValue: Collation | undefined;

  constructor(newValue: Collation | undefined, oldValue: Collation | undefined) {
    super('ENVCHANGE', 'onSqlCollationChange');

    this.type = 'SQL_COLLATION';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class RoutingEnvChangeToken extends Token {
  declare name: 'ENVCHANGE';
  declare handlerName: 'onRoutingChange';

  type: 'ROUTING_CHANGE';
  newValue: { protocol: number, port: number, server: string };
  oldValue: Buffer;

  constructor(newValue: { protocol: number, port: number, server: string }, oldValue: Buffer) {
    super('ENVCHANGE', 'onRoutingChange');

    this.type = 'ROUTING_CHANGE';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class FeatureExtAckToken extends Token {
  declare name: 'FEATUREEXTACK';
  declare handlerName: 'onFeatureExtAck';

  fedAuth: Buffer | undefined;

  /** Value of UTF8_SUPPORT acknowledgement.
   *
   * undefined when UTF8_SUPPORT not included in token. */
  utf8Support: boolean | undefined;

  constructor(fedAuth: Buffer | undefined, utf8Support: boolean | undefined) {
    super('FEATUREEXTACK', 'onFeatureExtAck');

    this.fedAuth = fedAuth;
    this.utf8Support = utf8Support;
  }
}

export class FedAuthInfoToken extends Token {
  declare name: 'FEDAUTHINFO';
  declare handlerName: 'onFedAuthInfo';

  spn: string | undefined;
  stsurl: string | undefined;

  constructor(spn: string | undefined, stsurl: string | undefined) {
    super('FEDAUTHINFO', 'onFedAuthInfo');

    this.spn = spn;
    this.stsurl = stsurl;
  }
}

export class InfoMessageToken extends Token {
  declare name: 'INFO';
  declare handlerName: 'onInfoMessage';

  number: number;
  state: number;
  class: number;
  message: string;
  serverName: string;
  procName: string;
  lineNumber: number;

  constructor({ number, state, class: clazz, message, serverName, procName, lineNumber }: { number: number, state: number, class: number, message: string, serverName: string, procName: string, lineNumber: number }) {
    super('INFO', 'onInfoMessage');

    this.number = number;
    this.state = state;
    this.class = clazz;
    this.message = message;
    this.serverName = serverName;
    this.procName = procName;
    this.lineNumber = lineNumber;
  }
}

export class ErrorMessageToken extends Token {
  declare name: 'ERROR';
  declare handlerName: 'onErrorMessage';

  number: number;
  state: number;
  class: number;
  message: string;
  serverName: string;
  procName: string;
  lineNumber: number;

  constructor({ number, state, class: clazz, message, serverName, procName, lineNumber }: { number: number, state: number, class: number, message: string, serverName: string, procName: string, lineNumber: number }) {
    super('ERROR', 'onErrorMessage');

    this.number = number;
    this.state = state;
    this.class = clazz;
    this.message = message;
    this.serverName = serverName;
    this.procName = procName;
    this.lineNumber = lineNumber;
  }
}

export class LoginAckToken extends Token {
  declare name: 'LOGINACK';
  declare handlerName: 'onLoginAck';

  interface: string;
  tdsVersion: string;
  progName: string;
  progVersion: { major: number, minor: number, buildNumHi: number, buildNumLow: number };

  constructor({ interface: interfaze, tdsVersion, progName, progVersion }: { interface: LoginAckToken['interface'], tdsVersion: LoginAckToken['tdsVersion'], progName: LoginAckToken['progName'], progVersion: LoginAckToken['progVersion'] }) {
    super('LOGINACK', 'onLoginAck');

    this.interface = interfaze;
    this.tdsVersion = tdsVersion;
    this.progName = progName;
    this.progVersion = progVersion;
  }
}

export class NBCRowToken extends Token {
  declare name: 'NBCROW';
  declare handlerName: 'onRow';

  columns: any;

  constructor(columns: any) {
    super('NBCROW', 'onRow');

    this.columns = columns;
  }
}

export class OrderToken extends Token {
  declare name: 'ORDER';
  declare handlerName: 'onOrder';

  orderColumns: number[];

  constructor(orderColumns: number[]) {
    super('ORDER', 'onOrder');

    this.orderColumns = orderColumns;
  }
}

export class ReturnStatusToken extends Token {
  declare name: 'RETURNSTATUS';
  declare handlerName: 'onReturnStatus';

  value: number;

  constructor(value: number) {
    super('RETURNSTATUS', 'onReturnStatus');

    this.value = value;
  }
}

export class ReturnValueToken extends Token {
  declare name: 'RETURNVALUE';
  declare handlerName: 'onReturnValue';

  paramOrdinal: number;
  paramName: string;
  metadata: Metadata;
  value: unknown;

  constructor({ paramOrdinal, paramName, metadata, value }: { paramOrdinal: number, paramName: string, metadata: Metadata, value: unknown }) {
    super('RETURNVALUE', 'onReturnValue');

    this.paramOrdinal = paramOrdinal;
    this.paramName = paramName;
    this.metadata = metadata;
    this.value = value;
  }
}

export class RowToken extends Token {
  declare name: 'ROW';
  declare handlerName: 'onRow';

  columns: any;

  constructor(columns: any) {
    super('ROW', 'onRow');

    this.columns = columns;
  }
}

export class SSPIToken extends Token {
  declare name: 'SSPICHALLENGE';
  declare handlerName: 'onSSPI';

  ntlmpacket: any;
  ntlmpacketBuffer: Buffer;

  constructor(ntlmpacket: any, ntlmpacketBuffer: Buffer) {
    super('SSPICHALLENGE', 'onSSPI');

    this.ntlmpacket = ntlmpacket;
    this.ntlmpacketBuffer = ntlmpacketBuffer;
  }
}
