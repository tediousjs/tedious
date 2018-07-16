// @flow

const WritableTrackingBuffer = require('./tracking-buffer/writable-tracking-buffer');
const os = require('os');
const sprintf = require('sprintf-js').sprintf;
const libraryName = require('./library').name;
const versions = require('./tds-versions').versions;

const FLAGS_1 = {
  ENDIAN_LITTLE: 0x00,
  ENDIAN_BIG: 0x01,
  CHARSET_ASCII: 0x00,
  CHARSET_EBCDIC: 0x02,
  FLOAT_IEEE_754: 0x00,
  FLOAT_VAX: 0x04,
  FLOAT_ND5000: 0x08,
  BCP_DUMPLOAD_ON: 0x00,
  BCP_DUMPLOAD_OFF: 0x10,
  USE_DB_ON: 0x00,
  USE_DB_OFF: 0x20,
  INIT_DB_WARN: 0x00,
  INIT_DB_FATAL: 0x40,
  SET_LANG_WARN_OFF: 0x00,
  SET_LANG_WARN_ON: 0x80
};

const FLAGS_2 = {
  INIT_LANG_WARN: 0x00,
  INIT_LANG_FATAL: 0x01,
  ODBC_OFF: 0x00,
  ODBC_ON: 0x02,
  F_TRAN_BOUNDARY: 0x04,
  F_CACHE_CONNECT: 0x08,
  USER_NORMAL: 0x00,
  USER_SERVER: 0x10,
  USER_REMUSER: 0x20,
  USER_SQLREPL: 0x40,
  INTEGRATED_SECURITY_OFF: 0x00,
  INTEGRATED_SECURITY_ON: 0x80
};

const TYPE_FLAGS = {
  SQL_DFLT: 0x00,
  SQL_TSQL: 0x08,
  OLEDB_OFF: 0x00,
  OLEDB_ON: 0x10,
  READ_WRITE_INTENT: 0x00,
  READ_ONLY_INTENT: 0x20
};

const FLAGS_3 = {
  CHANGE_PASSWORD_NO: 0x00,
  CHANGE_PASSWORD_YES: 0x01,
  BINARY_XML: 0x02,
  SPAWN_USER_INSTANCE: 0x04,
  UNKNOWN_COLLATION_HANDLING: 0x08
};

const NTLMFlags = {
  NTLM_NegotiateUnicode: 0x00000001,
  NTLM_NegotiateOEM: 0x00000002,
  NTLM_RequestTarget: 0x00000004,
  NTLM_Unknown9: 0x00000008,
  NTLM_NegotiateSign: 0x00000010,
  NTLM_NegotiateSeal: 0x00000020,
  NTLM_NegotiateDatagram: 0x00000040,
  NTLM_NegotiateLanManagerKey: 0x00000080,
  NTLM_Unknown8: 0x00000100,
  NTLM_NegotiateNTLM: 0x00000200,
  NTLM_NegotiateNTOnly: 0x00000400,
  NTLM_Anonymous: 0x00000800,
  NTLM_NegotiateOemDomainSupplied: 0x00001000,
  NTLM_NegotiateOemWorkstationSupplied: 0x00002000,
  NTLM_Unknown6: 0x00004000,
  NTLM_NegotiateAlwaysSign: 0x00008000,
  NTLM_TargetTypeDomain: 0x00010000,
  NTLM_TargetTypeServer: 0x00020000,
  NTLM_TargetTypeShare: 0x00040000,
  NTLM_NegotiateExtendedSecurity: 0x00080000,
  NTLM_NegotiateIdentify: 0x00100000,
  NTLM_Unknown5: 0x00200000,
  NTLM_RequestNonNTSessionKey: 0x00400000,
  NTLM_NegotiateTargetInfo: 0x00800000,
  NTLM_Unknown4: 0x01000000,
  NTLM_NegotiateVersion: 0x02000000,
  NTLM_Unknown3: 0x04000000,
  NTLM_Unknown2: 0x08000000,
  NTLM_Unknown1: 0x10000000,
  NTLM_Negotiate128: 0x20000000,
  NTLM_NegotiateKeyExchange: 0x40000000,
  NTLM_Negotiate56: 0x80000000
};

type LoginData = {
  tdsVersion: string,
  packetSize: number,

  initDbFatal?: boolean,
  domain?: string,
  workstation?: string,
  readOnlyIntent?: boolean,

  appName?: string,
  userName?: string,
  password?: string,
  serverName?: string,
  language?: string,
  database?: string,

  sspiBlob?: Buffer
};

/*
  s2.2.6.3
 */
module.exports = class Login7Payload {
  loginData: LoginData;

  tdsVersion: number;
  packetSize: number;
  clientProgVer: number;
  clientPid: number;
  connectionId: number;
  clientTimeZone: number;
  clientLcid: number;

  flags1: number;
  flags2: number;
  typeFlags: number;
  flags3: number;

  hostname: string;
  libraryName: string;
  clientId: Buffer;
  sspi: Buffer;
  attachDbFile: string;
  changePassword: string;

  constructor(loginData: LoginData) {
    this.loginData = loginData;

    this.tdsVersion = versions[this.loginData.tdsVersion];
    this.packetSize = this.loginData.packetSize;
    this.clientProgVer = 0;
    this.clientPid = process.pid;
    this.connectionId = 0;
    this.clientTimeZone = new Date().getTimezoneOffset();
    this.clientLcid = 0x00000409;
    this.flags1 = FLAGS_1.ENDIAN_LITTLE | FLAGS_1.CHARSET_ASCII | FLAGS_1.FLOAT_IEEE_754 | FLAGS_1.BCP_DUMPLOAD_OFF | FLAGS_1.USE_DB_OFF | FLAGS_1.SET_LANG_WARN_ON;
    if (this.loginData.initDbFatal) {
      this.flags1 |= FLAGS_1.INIT_DB_FATAL;
    } else {
      this.flags1 |= FLAGS_1.INIT_DB_WARN;
    }
    this.flags2 = FLAGS_2.INIT_LANG_WARN | FLAGS_2.ODBC_OFF | FLAGS_2.USER_NORMAL;
    if (this.loginData.domain) {
      this.flags2 |= FLAGS_2.INTEGRATED_SECURITY_ON;
    } else {
      this.flags2 |= FLAGS_2.INTEGRATED_SECURITY_OFF;
    }
    this.flags3 = FLAGS_3.CHANGE_PASSWORD_NO | FLAGS_3.UNKNOWN_COLLATION_HANDLING;
    this.typeFlags = TYPE_FLAGS.SQL_DFLT | TYPE_FLAGS.OLEDB_OFF;
    if (this.loginData.readOnlyIntent) {
      this.typeFlags |= TYPE_FLAGS.READ_ONLY_INTENT;
    } else {
      this.typeFlags |= TYPE_FLAGS.READ_WRITE_INTENT;
    }

    this.hostname = os.hostname();
    this.loginData = this.loginData || {};
    this.loginData.appName = this.loginData.appName || 'Tedious';
    this.libraryName = libraryName;
    this.clientId = new Buffer([1, 2, 3, 4, 5, 6]);

    this.attachDbFile = '';
    this.changePassword = '';

    if (this.loginData.sspiBlob) {
      this.sspi = this.loginData.sspiBlob;
    } else if (this.loginData.domain) {
      this.sspi = this.createNTLMRequest({
        domain: this.loginData.domain,
        workstation: this.loginData.workstation
      });
    } else {
      this.sspi = new Buffer(0);
    }
  }

  toBuffer() {
    const fixedData = new Buffer(94);
    const buffers = [fixedData];

    let offset = 0, dataOffset = fixedData.length;

    // Length: 4-byte
    offset = fixedData.writeUInt32LE(0, offset);

    // TDSVersion: 4-byte
    offset = fixedData.writeUInt32LE(this.tdsVersion, offset);

    // PacketSize: 4-byte
    offset = fixedData.writeUInt32LE(this.packetSize, offset);

    // ClientProgVer: 4-byte
    offset = fixedData.writeUInt32LE(this.clientProgVer, offset);

    // ClientPID: 4-byte
    offset = fixedData.writeUInt32LE(this.clientPid, offset);

    // ConnectionID: 4-byte
    offset = fixedData.writeUInt32LE(this.connectionId, offset);

    // OptionFlags1: 1-byte
    offset = fixedData.writeUInt8(this.flags1, offset);

    // OptionFlags2: 1-byte
    offset = fixedData.writeUInt8(this.flags2, offset);

    // TypeFlags: 1-byte
    offset = fixedData.writeUInt8(this.typeFlags, offset);

    // OptionFlags3: 1-byte
    offset = fixedData.writeUInt8(this.flags3, offset);

    // ClientTimZone: 4-byte
    offset = fixedData.writeInt32LE(this.clientTimeZone, offset);

    // ClientLCID: 4-byte
    offset = fixedData.writeUInt32LE(this.clientLcid, offset);

    // ibHostName: 2-byte
    offset = fixedData.writeUInt16LE(dataOffset, offset);

    // cchHostName: 2-byte
    if (this.hostname) {
      const buffer = new Buffer(this.hostname, 'ucs2');

      offset = fixedData.writeUInt16LE(buffer.length / 2, offset);
      dataOffset += buffer.length;

      buffers.push(buffer);
    } else {
      offset = fixedData.writeUInt16LE(dataOffset, offset);
    }

    // ibUserName: 2-byte
    offset = fixedData.writeUInt16LE(dataOffset, offset);

    // cchUserName: 2-byte
    if (!this.loginData.domain && this.loginData.userName) {
      const buffer = new Buffer(this.loginData.userName, 'ucs2');

      offset = fixedData.writeUInt16LE(buffer.length / 2, offset);
      dataOffset += buffer.length;

      buffers.push(buffer);
    } else {
      offset = fixedData.writeUInt16LE(0, offset);
    }

    // ibPassword: 2-byte
    offset = fixedData.writeUInt16LE(dataOffset, offset);

    // cchPassword: 2-byte
    if (!this.loginData.domain && this.loginData.password) {
      const buffer = new Buffer(this.loginData.password, 'ucs2');

      offset = fixedData.writeUInt16LE(buffer.length / 2, offset);
      dataOffset += buffer.length;

      buffers.push(this.scramblePassword(buffer));
    } else {
      offset = fixedData.writeUInt16LE(0, offset);
    }

    // ibAppName: 2-byte
    offset = fixedData.writeUInt16LE(dataOffset, offset);

    // cchAppName: 2-byte
    if (this.loginData.appName) {
      const buffer = new Buffer(this.loginData.appName, 'ucs2');

      offset = fixedData.writeUInt16LE(buffer.length / 2, offset);
      dataOffset += buffer.length;

      buffers.push(buffer);
    } else {
      offset = fixedData.writeUInt16LE(0, offset);
    }

    // ibServerName: 2-byte
    offset = fixedData.writeUInt16LE(dataOffset, offset);

    // cchServerName: 2-byte
    if (this.loginData.serverName) {
      const buffer = new Buffer(this.loginData.serverName, 'ucs2');

      offset = fixedData.writeUInt16LE(buffer.length / 2, offset);
      dataOffset += buffer.length;

      buffers.push(buffer);
    } else {
      offset = fixedData.writeUInt16LE(0, offset);
    }

    // (ibUnused / ibExtension): 2-byte
    offset = fixedData.writeUInt16LE(dataOffset, offset);

    // (cchUnused / cbExtension): 2-byte
    offset = fixedData.writeUInt16LE(0, offset);

    // ibCltIntName: 2-byte
    offset = fixedData.writeUInt16LE(dataOffset, offset);

    // cchCltIntName: 2-byte
    if (this.libraryName) {
      const buffer = new Buffer(this.libraryName, 'ucs2');

      offset = fixedData.writeUInt16LE(buffer.length / 2, offset);
      dataOffset += buffer.length;

      buffers.push(buffer);
    } else {
      offset = fixedData.writeUInt16LE(0, offset);
    }

    // ibLanguage: 2-byte
    offset = fixedData.writeUInt16LE(dataOffset, offset);

    // cchLanguage: 2-byte
    if (this.loginData.language) {
      const buffer = new Buffer(this.loginData.language, 'ucs2');

      offset = fixedData.writeUInt16LE(buffer.length / 2, offset);
      dataOffset += buffer.length;

      buffers.push(buffer);
    } else {
      offset = fixedData.writeUInt16LE(0, offset);
    }

    // ibDatabase: 2-byte
    offset = fixedData.writeUInt16LE(dataOffset, offset);

    // cchDatabase: 2-byte
    if (this.loginData.database) {
      const buffer = new Buffer(this.loginData.database, 'ucs2');

      offset = fixedData.writeUInt16LE(buffer.length / 2, offset);
      dataOffset += buffer.length;

      buffers.push(buffer);
    } else {
      offset = fixedData.writeUInt16LE(0, offset);
    }

    // ClientID: 6-byte
    offset += this.clientId.copy(fixedData, offset);

    // ibSSPI: 2-byte
    offset = fixedData.writeUInt16LE(dataOffset, offset);

    // cbSSPI: 2-byte
    if (this.sspi) {
      if (this.sspi.length > 65535) {
        offset = fixedData.writeUInt16LE(65535, offset);
      } else {
        offset = fixedData.writeUInt16LE(this.sspi.length, offset);
      }

      buffers.push(this.sspi);
    } else {
      offset = fixedData.writeUInt16LE(0, offset);
    }

    // ibAtchDBFile: 2-byte
    offset = fixedData.writeUInt16LE(dataOffset, offset);

    // cchAtchDBFile: 2-byte
    if (this.attachDbFile) {
      const buffer = new Buffer(this.attachDbFile, 'ucs2');

      offset = fixedData.writeUInt16LE(buffer.length / 2, offset);
      dataOffset += buffer.length;

      buffers.push(buffer);
    } else {
      offset = fixedData.writeUInt16LE(0, offset);
    }

    // ibChangePassword: 2-byte
    offset = fixedData.writeUInt16LE(dataOffset, offset);

    // cchChangePassword: 2-byte
    if (this.changePassword) {
      const buffer = new Buffer(this.changePassword, 'ucs2');

      offset = fixedData.writeUInt16LE(buffer.length / 2, offset);
      dataOffset += buffer.length;

      buffers.push(buffer);
    } else {
      offset = fixedData.writeUInt16LE(0, offset);
    }

    // cbSSPILong: 4-byte
    if (this.sspi && this.sspi.length > 65535) {
      fixedData.writeUInt32LE(this.sspi.length, offset);
    } else {
      fixedData.writeUInt32LE(0, offset);
    }

    const data = Buffer.concat(buffers);
    data.writeUInt32LE(data.length, 0);
    return data;
  }

  createNTLMRequest(options: { domain: string, workstation?: string }) {
    const domain = escape(options.domain.toUpperCase());
    const workstation = options.workstation ? escape(options.workstation.toUpperCase()) : '';
    const protocol = 'NTLMSSP\u0000';
    const BODY_LENGTH = 40;
    const bufferLength = BODY_LENGTH + domain.length;
    const buffer = new WritableTrackingBuffer(bufferLength);

    let type1flags = this.getNTLMFlags();
    if (workstation === '') {
      type1flags -= NTLMFlags.NTLM_NegotiateOemWorkstationSupplied;
    }

    buffer.writeString(protocol, 'utf8');
    buffer.writeUInt32LE(1);
    buffer.writeUInt32LE(type1flags);
    buffer.writeUInt16LE(domain.length);
    buffer.writeUInt16LE(domain.length);
    buffer.writeUInt32LE(BODY_LENGTH + workstation.length);
    buffer.writeUInt16LE(workstation.length);
    buffer.writeUInt16LE(workstation.length);
    buffer.writeUInt32LE(BODY_LENGTH);
    buffer.writeUInt8(5);
    buffer.writeUInt8(0);
    buffer.writeUInt16LE(2195);
    buffer.writeUInt8(0);
    buffer.writeUInt8(0);
    buffer.writeUInt8(0);
    buffer.writeUInt8(15);
    buffer.writeString(workstation, 'ascii');
    buffer.writeString(domain, 'ascii');
    return buffer.data;
  }

  scramblePassword(password: Buffer) {
    for (let b = 0, len = password.length; b < len; b++) {
      let byte = password[b];
      const lowNibble = byte & 0x0f;
      const highNibble = byte >> 4;
      byte = (lowNibble << 4) | highNibble;
      byte = byte ^ 0xa5;
      password[b] = byte;
    }
    return password;
  }

  getNTLMFlags() {
    return NTLMFlags.NTLM_NegotiateUnicode + NTLMFlags.NTLM_NegotiateOEM + NTLMFlags.NTLM_RequestTarget + NTLMFlags.NTLM_NegotiateNTLM + NTLMFlags.NTLM_NegotiateOemDomainSupplied + NTLMFlags.NTLM_NegotiateOemWorkstationSupplied + NTLMFlags.NTLM_NegotiateAlwaysSign + NTLMFlags.NTLM_NegotiateVersion + NTLMFlags.NTLM_NegotiateExtendedSecurity + NTLMFlags.NTLM_Negotiate128 + NTLMFlags.NTLM_Negotiate56;
  }

  toString(indent?: string = '') {
    return indent + 'Login7 - ' +
      sprintf('TDS:0x%08X, PacketSize:0x%08X, ClientProgVer:0x%08X, ClientPID:0x%08X, ConnectionID:0x%08X',
        this.tdsVersion, this.packetSize, this.clientProgVer, this.clientPid, this.connectionId
      ) + '\n' + indent + '         ' +
      sprintf('Flags1:0x%02X, Flags2:0x%02X, TypeFlags:0x%02X, Flags3:0x%02X, ClientTimezone:%d, ClientLCID:0x%08X',
        this.flags1, this.flags2, this.typeFlags, this.flags3, this.clientTimeZone, this.clientLcid
      ) + '\n' + indent + '         ' +
      sprintf("Hostname:'%s', Username:'%s', Password:'%s', AppName:'%s', ServerName:'%s', LibraryName:'%s'",
        this.hostname, this.loginData.userName, this.loginData.password, this.loginData.appName, this.loginData.serverName, libraryName
      ) + '\n' + indent + '         ' +
      sprintf("Language:'%s', Database:'%s', SSPI:'%s', AttachDbFile:'%s', ChangePassword:'%s'",
        this.loginData.language, this.loginData.database, this.sspi, this.attachDbFile, this.changePassword
      );
  }
};
