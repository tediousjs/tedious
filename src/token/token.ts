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

export abstract class BaseToken {}

export class ColMetadataToken extends BaseToken {
  name: 'COLMETADATA';
  event: 'columnMetadata';

  columns: ColumnMetadata[]

  constructor(columns: ColumnMetadata[]) {
    super();

    this.name = 'COLMETADATA';
    this.event = 'columnMetadata';

    this.columns = columns;
  }
}

export class DoneToken extends BaseToken {
  name: 'DONE';
  event: 'done';

  more: boolean;
  sqlError: boolean;
  attention: boolean;
  serverError: boolean;
  rowCount: number | undefined;
  curCmd: number;

  constructor({ more, sqlError, attention, serverError, rowCount, curCmd }: { more: boolean, sqlError: boolean, attention: boolean, serverError: boolean, rowCount: number | undefined, curCmd: number }) {
    super();

    this.name = 'DONE';
    this.event = 'done';

    this.more = more;
    this.sqlError = sqlError;
    this.attention = attention;
    this.serverError = serverError;
    this.rowCount = rowCount;
    this.curCmd = curCmd;
  }
}

export class DoneInProcToken extends BaseToken {
  name: 'DONEINPROC';
  event: 'doneInProc';

  more: boolean;
  sqlError: boolean;
  attention: boolean;
  serverError: boolean;
  rowCount: number | undefined;
  curCmd: number;

  constructor({ more, sqlError, attention, serverError, rowCount, curCmd }: { more: boolean, sqlError: boolean, attention: boolean, serverError: boolean, rowCount: number | undefined, curCmd: number }) {
    super();

    this.name = 'DONEINPROC';
    this.event = 'doneInProc';

    this.more = more;
    this.sqlError = sqlError;
    this.attention = attention;
    this.serverError = serverError;
    this.rowCount = rowCount;
    this.curCmd = curCmd;
  }
}

export class DoneProcToken extends BaseToken {
  name: 'DONEPROC';
  event: 'doneProc';

  more: boolean;
  sqlError: boolean;
  attention: boolean;
  serverError: boolean;
  rowCount: number | undefined;
  curCmd: number;

  constructor({ more, sqlError, attention, serverError, rowCount, curCmd }: { more: boolean, sqlError: boolean, attention: boolean, serverError: boolean, rowCount: number | undefined, curCmd: number }) {
    super();

    this.name = 'DONEPROC';
    this.event = 'doneProc';

    this.more = more;
    this.sqlError = sqlError;
    this.attention = attention;
    this.serverError = serverError;
    this.rowCount = rowCount;
    this.curCmd = curCmd;
  }
}

export class DatabaseEnvChangeToken extends BaseToken {
  name: 'ENVCHANGE';
  event: 'databaseChange';

  type: 'DATABASE';
  newValue: string;
  oldValue: string;

  constructor(newValue: string, oldValue: string) {
    super();

    this.name = 'ENVCHANGE';
    this.event = 'databaseChange';

    this.type = 'DATABASE';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class LanguageEnvChangeToken extends BaseToken {
  name: 'ENVCHANGE';
  event: 'languageChange';

  type: 'LANGUAGE';
  newValue: string;
  oldValue: string;

  constructor(newValue: string, oldValue: string) {
    super();

    this.name = 'ENVCHANGE';
    this.event = 'languageChange';

    this.type = 'LANGUAGE';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class CharsetEnvChangeToken extends BaseToken {
  name: 'ENVCHANGE';
  event: 'charsetChange';

  type: 'CHARSET';
  newValue: string;
  oldValue: string;

  constructor(newValue: string, oldValue: string) {
    super();

    this.name = 'ENVCHANGE';
    this.event = 'charsetChange';

    this.type = 'CHARSET';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class PacketSizeEnvChangeToken extends BaseToken {
  name: 'ENVCHANGE';
  event: 'packetSizeChange';

  type: 'PACKET_SIZE';
  newValue: number;
  oldValue: number;

  constructor(newValue: number, oldValue: number) {
    super();

    this.name = 'ENVCHANGE';
    this.event = 'packetSizeChange';

    this.type = 'PACKET_SIZE';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class BeginTransactionEnvChangeToken extends BaseToken {
  name: 'ENVCHANGE';
  event: 'beginTransaction';

  type: 'BEGIN_TXN';
  newValue: Buffer;
  oldValue: Buffer;

  constructor(newValue: Buffer, oldValue: Buffer) {
    super();

    this.name = 'ENVCHANGE';
    this.event = 'beginTransaction';

    this.type = 'BEGIN_TXN';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class CommitTransactionEnvChangeToken extends BaseToken {
  name: 'ENVCHANGE';
  event: 'commitTransaction';

  type: 'COMMIT_TXN';
  newValue: Buffer;
  oldValue: Buffer;

  constructor(newValue: Buffer, oldValue: Buffer) {
    super();

    this.name = 'ENVCHANGE';
    this.event = 'commitTransaction';

    this.type = 'COMMIT_TXN';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class RollbackTransactionEnvChangeToken extends BaseToken {
  name: 'ENVCHANGE';
  event: 'rollbackTransaction';

  type: 'ROLLBACK_TXN';
  oldValue: Buffer;
  newValue: Buffer;

  constructor(newValue: Buffer, oldValue: Buffer) {
    super();

    this.name = 'ENVCHANGE';
    this.event = 'rollbackTransaction';

    this.type = 'ROLLBACK_TXN';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class DatabaseMirroringPartnerEnvChangeToken extends BaseToken {
  name: 'ENVCHANGE';
  event: 'partnerNode';

  type: 'DATABASE_MIRRORING_PARTNER';
  oldValue: string;
  newValue: string;

  constructor(newValue: string, oldValue: string) {
    super();

    this.name = 'ENVCHANGE';
    this.event = 'partnerNode';

    this.type = 'DATABASE_MIRRORING_PARTNER';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class ResetConnectionEnvChangeToken extends BaseToken {
  name: 'ENVCHANGE';
  event: 'resetConnection';

  type: 'RESET_CONNECTION';
  oldValue: Buffer;
  newValue: Buffer;

  constructor(newValue: Buffer, oldValue: Buffer) {
    super();

    this.name = 'ENVCHANGE';
    this.event = 'resetConnection';

    this.type = 'RESET_CONNECTION';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class CollationChangeToken extends BaseToken {
  name: 'ENVCHANGE';
  event: 'sqlCollationChange';

  type: 'SQL_COLLATION';
  oldValue: string;
  newValue: string;

  constructor(newValue: string, oldValue: string) {
    super();

    this.name = 'ENVCHANGE';
    this.event = 'sqlCollationChange';

    this.type = 'SQL_COLLATION';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class RoutingEnvChangeToken extends BaseToken {
  name: 'ENVCHANGE';
  event: 'routingChange';

  type: 'ROUTING_CHANGE';
  newValue: { protocol: number, port: number, server: string };
  oldValue: Buffer;

  constructor(newValue: { protocol: number, port: number, server: string }, oldValue: Buffer) {
    super();

    this.name = 'ENVCHANGE';
    this.event = 'routingChange';

    this.type = 'ROUTING_CHANGE';
    this.newValue = newValue;
    this.oldValue = oldValue;
  }
}

export class FeatureExtAckToken extends BaseToken {
  name: 'FEATUREEXTACK';
  event: 'featureExtAck';

  fedAuth: Buffer | undefined;

  constructor(fedAuth: Buffer | undefined) {
    super();

    this.name = 'FEATUREEXTACK';
    this.event = 'featureExtAck';

    this.fedAuth = fedAuth;
  }
}

export class FedAuthInfoToken extends BaseToken {
  name: 'FEDAUTHINFO';
  event: 'fedAuthInfo';

  spn: string | undefined;
  stsurl: string | undefined;

  constructor(spn: string | undefined, stsurl: string | undefined) {
    super();

    this.name = 'FEDAUTHINFO';
    this.event = 'fedAuthInfo';

    this.spn = spn;
    this.stsurl = stsurl;
  }
}

export class InfoMessageToken extends BaseToken {
  name: 'INFO';
  event: 'infoMessage';

  number: number;
  state: number;
  class: number;
  message: string;
  serverName: string;
  procName: string;
  lineNumber: number;

  constructor({ number, state, class: clazz, message, serverName, procName, lineNumber }: { number: number, state: number, class: number, message: string, serverName: string, procName: string, lineNumber: number }) {
    super();

    this.name = 'INFO';
    this.event = 'infoMessage';

    this.number = number;
    this.state = state;
    this.class = clazz;
    this.message = message;
    this.serverName = serverName;
    this.procName = procName;
    this.lineNumber = lineNumber;
  }
}

export class ErrorMessageToken extends BaseToken {
  name: 'ERROR';
  event: 'errorMessage';

  number: number;
  state: number;
  class: number;
  message: string;
  serverName: string;
  procName: string;
  lineNumber: number;

  constructor({ number, state, class: clazz, message, serverName, procName, lineNumber }: { number: number, state: number, class: number, message: string, serverName: string, procName: string, lineNumber: number }) {
    super();

    this.name = 'ERROR';
    this.event = 'errorMessage';

    this.number = number;
    this.state = state;
    this.class = clazz;
    this.message = message;
    this.serverName = serverName;
    this.procName = procName;
    this.lineNumber = lineNumber;
  }
}

export class LoginAckToken extends BaseToken {
  name: 'LOGINACK';
  event: 'loginack';

  interface: string;
  tdsVersion: string;
  progName: string;
  progVersion: { major: number, minor: number, buildNumHi: number, buildNumLow: number };

  constructor({ interface: interfaze, tdsVersion, progName, progVersion }: { interface: LoginAckToken['interface'], tdsVersion: LoginAckToken['tdsVersion'], progName: LoginAckToken['progName'], progVersion: LoginAckToken['progVersion'] }) {
    super();

    this.name = 'LOGINACK';
    this.event = 'loginack';

    this.interface = interfaze;
    this.tdsVersion = tdsVersion;
    this.progName = progName;
    this.progVersion = progVersion;
  }
}

export class NBCRowToken extends BaseToken {
  name: 'NBCROW';
  event: 'row';
  columns: any[];

  constructor(columns: any[]) {
    super();

    this.name = 'NBCROW';
    this.event = 'row';
    this.columns = columns;
  }
}

export class OrderToken extends BaseToken {
  name: 'ORDER';
  event: 'order';
  orderColumns: number[];

  constructor(orderColumns: number[]) {
    super();

    this.name = 'ORDER';
    this.event = 'order';
    this.orderColumns = orderColumns;
  }
}

export class ReturnStatusToken extends BaseToken {
  name: 'RETURNSTATUS';
  event: 'returnStatus';
  value: number;

  constructor(value: number) {
    super();

    this.name = 'RETURNSTATUS';
    this.event = 'returnStatus';
    this.value = value;
  }
}

export class ReturnValueToken extends BaseToken {
  name: 'RETURNVALUE';
  event: 'returnValue';

  paramOrdinal: number;
  paramName: string;
  metadata: Metadata;
  value: unknown;

  constructor({ paramOrdinal, paramName, metadata, value }: { paramOrdinal: number, paramName: string, metadata: Metadata, value: unknown }) {
    super();

    this.name = 'RETURNVALUE';
    this.event = 'returnValue';

    this.paramOrdinal = paramOrdinal;
    this.paramName = paramName;
    this.metadata = metadata;
    this.value = value;
  }
}

export class RowToken extends BaseToken {
  name: 'ROW';
  event: 'row';
  columns: any[];

  constructor(columns: any[]) {
    super();

    this.name = 'ROW';
    this.event = 'row';
    this.columns = columns;
  }
}

export class SSPIToken extends BaseToken {
  name: 'SSPICHALLENGE';
  event: 'sspichallenge';

  ntlmpacket: any;
  ntlmpacketBuffer: Buffer;

  constructor(ntlmpacket: any, ntlmpacketBuffer: Buffer) {
    super();

    this.name = 'SSPICHALLENGE';
    this.event = 'sspichallenge';

    this.ntlmpacket = ntlmpacket;
    this.ntlmpacketBuffer = ntlmpacketBuffer;
  }
}

export class EndOfMessageToken extends BaseToken {
  name: 'EOM';
  event: 'endOfMessage';

  constructor() {
    super();

    this.name = 'EOM';
    this.event = 'endOfMessage';
  }
}

export type Token = ColMetadataToken
                  | DoneToken
                  | DoneInProcToken
                  | DoneProcToken
                  | DatabaseEnvChangeToken
                  | LanguageEnvChangeToken
                  | CharsetEnvChangeToken
                  | PacketSizeEnvChangeToken
                  | BeginTransactionEnvChangeToken
                  | CommitTransactionEnvChangeToken
                  | RollbackTransactionEnvChangeToken
                  | DatabaseMirroringPartnerEnvChangeToken
                  | ResetConnectionEnvChangeToken
                  | RoutingEnvChangeToken
                  | FeatureExtAckToken
                  | FedAuthInfoToken
                  | InfoMessageToken
                  | ErrorMessageToken
                  | LoginAckToken
                  | NBCRowToken
                  | OrderToken
                  | ReturnStatusToken
                  | ReturnValueToken
                  | RowToken
                  | SSPIToken
                  | EndOfMessageToken;
