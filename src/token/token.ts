import { Metadata } from '../metadata-parser';
import { ColumnMetadata } from './colmetadata-token-parser';

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

export abstract class Token {
  name: string;
  event: string;

  constructor(name: string, event: string) {
    this.name = name;
    this.event = event;
  }
}

export class ColMetadataToken extends Token {
  columns: ColumnMetadata[]

  constructor(columns: ColumnMetadata[]) {
    super('COLMETADATA', 'columnMetadata');

    this.columns = columns;
  }
}

export class DoneToken extends Token {
  name!: 'DONE';
  event!: 'done';

  more: boolean;
  sqlError: boolean;
  attention: boolean;
  serverError: boolean;
  rowCount: number | undefined;
  curCmd: number;

  constructor({ more, sqlError, attention, serverError, rowCount, curCmd }: { more: boolean, sqlError: boolean, attention: boolean, serverError: boolean, rowCount: number | undefined, curCmd: number }) {
    super('DONE', 'done');

    this.more = more;
    this.sqlError = sqlError;
    this.attention = attention;
    this.serverError = serverError;
    this.rowCount = rowCount;
    this.curCmd = curCmd;
  }
}

export class DoneInProcToken extends Token {
  more: boolean;
  sqlError: boolean;
  attention: boolean;
  serverError: boolean;
  rowCount: number | undefined;
  curCmd: number;

  constructor({ more, sqlError, attention, serverError, rowCount, curCmd }: { more: boolean, sqlError: boolean, attention: boolean, serverError: boolean, rowCount: number | undefined, curCmd: number }) {
    super('DONEINPROC', 'doneInProc');

    this.more = more;
    this.sqlError = sqlError;
    this.attention = attention;
    this.serverError = serverError;
    this.rowCount = rowCount;
    this.curCmd = curCmd;
  }
}

export class DoneProcToken extends Token {
  more: boolean;
  sqlError: boolean;
  attention: boolean;
  serverError: boolean;
  rowCount: number | undefined;
  curCmd: number;

  constructor({ more, sqlError, attention, serverError, rowCount, curCmd }: { more: boolean, sqlError: boolean, attention: boolean, serverError: boolean, rowCount: number | undefined, curCmd: number }) {
    super('DONEPROC', 'doneProc');

    this.more = more;
    this.sqlError = sqlError;
    this.attention = attention;
    this.serverError = serverError;
    this.rowCount = rowCount;
    this.curCmd = curCmd;
  }
}

export class DatabaseEnvChangeToken extends Token {
  type: 'DATABASE';
  newValue: string;
  oldValue: string;

  constructor(newValue: string, oldValue: string) {
    super('ENVCHANGE', 'databaseChange');

    this.type = 'DATABASE';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class LanguageEnvChangeToken extends Token {
  type: 'LANGUAGE';
  newValue: string;
  oldValue: string;

  constructor(newValue: string, oldValue: string) {
    super('ENVCHANGE', 'languageChange');

    this.type = 'LANGUAGE';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class CharsetEnvChangeToken extends Token {
  type: 'CHARSET';
  newValue: string;
  oldValue: string;

  constructor(newValue: string, oldValue: string) {
    super('ENVCHANGE', 'charsetChange');

    this.type = 'CHARSET';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class PacketSizeEnvChangeToken extends Token {
  type: 'PACKET_SIZE';
  newValue: number;
  oldValue: number;

  constructor(newValue: number, oldValue: number) {
    super('ENVCHANGE', 'packetSizeChange');

    this.type = 'PACKET_SIZE';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class BeginTransactionEnvChangeToken extends Token {
  type: 'BEGIN_TXN';
  newValue: Buffer;
  oldValue: Buffer;

  constructor(newValue: Buffer, oldValue: Buffer) {
    super('ENVCHANGE', 'beginTransaction');

    this.name = 'ENVCHANGE';
    this.event = 'beginTransaction';

    this.type = 'BEGIN_TXN';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class CommitTransactionEnvChangeToken extends Token {
  type: 'COMMIT_TXN';
  newValue: Buffer;
  oldValue: Buffer;

  constructor(newValue: Buffer, oldValue: Buffer) {
    super('ENVCHANGE', 'commitTransaction');

    this.type = 'COMMIT_TXN';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class RollbackTransactionEnvChangeToken extends Token {
  type: 'ROLLBACK_TXN';
  oldValue: Buffer;
  newValue: Buffer;

  constructor(newValue: Buffer, oldValue: Buffer) {
    super('ENVCHANGE', 'rollbackTransaction');

    this.type = 'ROLLBACK_TXN';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class DatabaseMirroringPartnerEnvChangeToken extends Token {
  type: 'DATABASE_MIRRORING_PARTNER';
  oldValue: string;
  newValue: string;

  constructor(newValue: string, oldValue: string) {
    super('ENVCHANGE', 'partnerNode');

    this.name = 'ENVCHANGE';
    this.event = 'partnerNode';

    this.type = 'DATABASE_MIRRORING_PARTNER';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class ResetConnectionEnvChangeToken extends Token {
  type: 'RESET_CONNECTION';
  oldValue: Buffer;
  newValue: Buffer;

  constructor(newValue: Buffer, oldValue: Buffer) {
    super('ENVCHANGE', 'resetConnection');

    this.name = 'ENVCHANGE';
    this.event = 'resetConnection';

    this.type = 'RESET_CONNECTION';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class CollationChangeToken extends Token {
  type: 'SQL_COLLATION';
  oldValue: Buffer;
  newValue: Buffer;

  constructor(newValue: Buffer, oldValue: Buffer) {
    super('ENVCHANGE', 'sqlCollationChange');

    this.type = 'SQL_COLLATION';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class RoutingEnvChangeToken extends Token {
  type: 'ROUTING_CHANGE';
  newValue: { protocol: number, port: number, server: string };
  oldValue: Buffer;

  constructor(newValue: { protocol: number, port: number, server: string }, oldValue: Buffer) {
    super('ENVCHANGE', 'routingChange');

    this.type = 'ROUTING_CHANGE';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class FeatureExtAckToken extends Token {
  fedAuth: Buffer | undefined;

  constructor(fedAuth: Buffer | undefined) {
    super('FEATUREEXTACK', 'featureExtAck');

    this.fedAuth = fedAuth;
  }
}

export class FedAuthInfoToken extends Token {
  spn: string | undefined;
  stsurl: string | undefined;

  constructor(spn: string | undefined, stsurl: string | undefined) {
    super('FEDAUTHINFO', 'fedAuthInfo');

    this.spn = spn;
    this.stsurl = stsurl;
  }
}

export class InfoMessageToken extends Token {
  number: number;
  state: number;
  class: number;
  message: string;
  serverName: string;
  procName: string;
  lineNumber: number;

  constructor({ number, state, class: clazz, message, serverName, procName, lineNumber }: { number: number, state: number, class: number, message: string, serverName: string, procName: string, lineNumber: number }) {
    super('INFO', 'infoMessage');

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
  number: number;
  state: number;
  class: number;
  message: string;
  serverName: string;
  procName: string;
  lineNumber: number;

  constructor({ number, state, class: clazz, message, serverName, procName, lineNumber }: { number: number, state: number, class: number, message: string, serverName: string, procName: string, lineNumber: number }) {
    super('ERROR', 'errorMessage');

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
  interface: string;
  tdsVersion: string;
  progName: string;
  progVersion: { major: number, minor: number, buildNumHi: number, buildNumLow: number };

  constructor({ interface: interfaze, tdsVersion, progName, progVersion }: { interface: LoginAckToken['interface'], tdsVersion: LoginAckToken['tdsVersion'], progName: LoginAckToken['progName'], progVersion: LoginAckToken['progVersion'] }) {
    super('LOGINACK', 'loginack');

    this.interface = interfaze;
    this.tdsVersion = tdsVersion;
    this.progName = progName;
    this.progVersion = progVersion;
  }
}

export class NBCRowToken extends Token {
  columns: any;

  constructor(columns: any) {
    super('NBCROW', 'row');

    this.columns = columns;
  }
}

export class OrderToken extends Token {
  orderColumns: number[];

  constructor(orderColumns: number[]) {
    super('ORDER', 'order');

    this.orderColumns = orderColumns;
  }
}

export class ReturnStatusToken extends Token {
  value: number;

  constructor(value: number) {
    super('RETURNSTATUS', 'returnStatus');

    this.value = value;
  }
}

export class ReturnValueToken extends Token {
  paramOrdinal: number;
  paramName: string;
  metadata: Metadata;
  value: unknown;

  constructor({ paramOrdinal, paramName, metadata, value }: { paramOrdinal: number, paramName: string, metadata: Metadata, value: unknown }) {
    super('RETURNVALUE', 'returnValue');

    this.paramOrdinal = paramOrdinal;
    this.paramName = paramName;
    this.metadata = metadata;
    this.value = value;
  }
}

export class RowToken extends Token {
  columns: any;

  constructor(columns: any) {
    super('ROW', 'row');

    this.columns = columns;
  }
}

export class SSPIToken extends Token {
  ntlmpacket: any;
  ntlmpacketBuffer: Buffer;

  constructor(ntlmpacket: any, ntlmpacketBuffer: Buffer) {
    super('SSPICHALLENGE', 'sspichallenge');

    this.ntlmpacket = ntlmpacket;
    this.ntlmpacketBuffer = ntlmpacketBuffer;
  }
}

export class EndOfMessageToken extends Token {
  constructor() {
    super('EOM', 'endOfMessage');
  }
}
