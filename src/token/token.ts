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

export type Token = { name: 'COLMETADATA', event: 'columnMetadata', columns: any[] }
                  | { name: 'DONE', event: 'done', more: boolean, sqlError: boolean, attention: boolean, serverError: boolean, rowCount: number | undefined, curCmd: number }
                  | { name: 'DONEINPROC', event: 'doneInProc', more: boolean, sqlError: boolean, attention: boolean, serverError: boolean, rowCount: number | undefined, curCmd: number }
                  | { name: 'DONEPROC', event: 'doneProc', more: boolean, sqlError: boolean, attention: boolean, serverError: boolean, rowCount: number | undefined, curCmd: number }
                  | { name: 'ENVCHANGE', type: 'DATABASE', event: 'databaseChange', oldValue: string, newValue: string }
                  | { name: 'ENVCHANGE', type: 'LANGUAGE', event: 'languageChange', oldValue: string, newValue: string }
                  | { name: 'ENVCHANGE', type: 'CHARSET', event: 'charsetChange', oldValue: string, newValue: string }
                  | { name: 'ENVCHANGE', type: 'PACKET_SIZE', event: 'packetSizeChange', oldValue: number, newValue: number }
                  | { name: 'ENVCHANGE', type: 'BEGIN_TXN', event: 'beginTransaction', oldValue: Buffer, newValue: Buffer }
                  | { name: 'ENVCHANGE', type: 'COMMIT_TXN', event: 'commitTransaction', oldValue: Buffer, newValue: Buffer }
                  | { name: 'ENVCHANGE', type: 'ROLLBACK_TXN', event: 'rollbackTransaction', oldValue: Buffer, newValue: Buffer }
                  | { name: 'ENVCHANGE', type: 'DATABASE_MIRRORING_PARTNER', event: 'partnerNode', oldValue: string, newValue: string }
                  | { name: 'ENVCHANGE', type: 'RESET_CONNECTION', event: 'resetConnection', oldValue: Buffer, newValue: Buffer }
                  | { name: 'ENVCHANGE', type: 'ROUTING_CHANGE', event: 'routingChange', oldValue: Buffer, newValue: { protocol: number, port: number, server: string } }
                  | { name: 'FEATUREEXTACK', event: 'featureExtAck', fedAuth?: Buffer }
                  | { name: 'FEDAUTHINFO', event: 'fedAuthInfo', spn?: string, stsurl?: string }
                  | { name: 'INFO', event: 'infoMessage', number: number, state: number, class: number, message: string, serverName: string, procName: string, lineNumber: number }
                  | { name: 'ERROR', event: 'errorMessage', number: number, state: number, class: number, message: string, serverName: string, procName: string, lineNumber: number }
                  | { name: 'LOGINACK', event: 'loginack', interface: string, tdsVersion: string, progName: string, progVersion: { major: number, minor: number, buildNumHi: number, buildNumLow: number } }
                  | { name: 'NBCROW', event: 'row', columns: any[] }
                  | { name: 'ORDER', event: 'order', orderColumns: number[] }
                  | { name: 'RETURNSTATUS', event: 'returnStatus', value: number }
                  | { name: 'RETURNVALUE', event: 'returnValue', paramOrdinal: number, paramName: string, metadata: any, value: unknown }
                  | { name: 'ROW', event: 'row', columns: any }
                  | { name: 'SSPICHALLENGE', event: 'sspichallenge', ntlmpacket: any, ntlmpacketBuffer: Buffer }
                  | { name: 'EOM', event: 'endOfMessage' };
