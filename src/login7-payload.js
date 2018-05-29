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

/*
  s2.2.6.3
 */
module.exports = class Login7Payload {
  constructor(loginData) {
    this.loginData = loginData;

    const lengthLength = 4;
    const fixed = this.createFixedData();
    const variable = this.createVariableData(lengthLength + fixed.length);
    const length = lengthLength + fixed.length + variable.length;
    const data = new WritableTrackingBuffer(300);
    data.writeUInt32LE(length);
    data.writeBuffer(fixed);
    data.writeBuffer(variable);
    this.data = data.data;
  }

  createFixedData() {
    this.tdsVersion = versions[this.loginData.tdsVersion];
    this.packetSize = this.loginData.packetSize;
    this.clientProgVer = 0;
    this.clientPid = process.pid;
    this.connectionId = 0;
    this.clientTimeZone = new Date().getTimezoneOffset();
    this.clientLcid = 0x00000409;
    this.flags1 = FLAGS_1.ENDIAN_LITTLE | FLAGS_1.CHARSET_ASCII | FLAGS_1.FLOAT_IEEE_754 | FLAGS_1.BCD_DUMPLOAD_OFF | FLAGS_1.USE_DB_OFF | FLAGS_1.SET_LANG_WARN_ON;
    if (this.loginData.initDbFatal) {
      this.flags1 |= FLAGS_1.INIT_DB_FATAL;
    } else {
      this.flags1 |= FLAGS_1.INIT_DB_WARN;
    }
    this.flags2 = FLAGS_2.INIT_LANG_WARN | FLAGS_2.ODBC_OFF | FLAGS_2.USER_NORMAL;
    if (this.loginData.sspiBlob && this.loginData.sspiBlob.length) {
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

    const buffer = new WritableTrackingBuffer(100);
    buffer.writeUInt32LE(this.tdsVersion);
    buffer.writeUInt32LE(this.packetSize);
    buffer.writeUInt32LE(this.clientProgVer);
    buffer.writeUInt32LE(this.clientPid);
    buffer.writeUInt32LE(this.connectionId);
    buffer.writeUInt8(this.flags1);
    buffer.writeUInt8(this.flags2);
    buffer.writeUInt8(this.typeFlags);
    buffer.writeUInt8(this.flags3);
    buffer.writeInt32LE(this.clientTimeZone);
    buffer.writeUInt32LE(this.clientLcid);
    return buffer.data;
  }

  createVariableData(offset) {
    this.variableLengthsLength = (9 * 4) + 6 + (3 * 4) + 4;
    if (this.loginData.tdsVersion === '7_1') {
      this.variableLengthsLength = (9 * 4) + 6 + (2 * 4);
    }
    const variableData = {
      offsetsAndLengths: new WritableTrackingBuffer(200),
      data: new WritableTrackingBuffer(200, 'ucs2'),
      offset: offset + this.variableLengthsLength
    };
    this.hostname = os.hostname();
    this.loginData = this.loginData || {};
    this.loginData.appName = this.loginData.appName || 'Tedious';
    this.libraryName = libraryName;
    this.clientId = new Buffer([1, 2, 3, 4, 5, 6]);
    this.attachDbFile = '';
    this.changePassword = '';
    this.addVariableDataString(variableData, this.hostname);
    this.addVariableDataString(variableData, this.loginData.userName);
    this.addVariableDataBuffer(variableData, this.createPasswordBuffer());
    this.addVariableDataString(variableData, this.loginData.appName);
    this.addVariableDataString(variableData, this.loginData.serverName);
    this.addVariableDataString(variableData, '');
    this.addVariableDataString(variableData, this.libraryName);
    this.addVariableDataString(variableData, this.loginData.language);
    this.addVariableDataString(variableData, this.loginData.database);
    variableData.offsetsAndLengths.writeBuffer(this.clientId);

    this.ntlmPacket = this.loginData.sspiBlob;
    this.sspiLong = this.ntlmPacket.length;
    variableData.offsetsAndLengths.writeUInt16LE(variableData.offset);
    variableData.offsetsAndLengths.writeUInt16LE(this.ntlmPacket.length);
    variableData.data.writeBuffer(this.ntlmPacket);
    variableData.offset += this.ntlmPacket.length;

    this.addVariableDataString(variableData, this.attachDbFile);
    if (this.loginData.tdsVersion > '7_1') {
      this.addVariableDataString(variableData, this.changePassword);
      variableData.offsetsAndLengths.writeUInt32LE(this.sspiLong);
    }

    return Buffer.concat([variableData.offsetsAndLengths.data, variableData.data.data]);
  }

  addVariableDataBuffer(variableData, buffer) {
    variableData.offsetsAndLengths.writeUInt16LE(variableData.offset);
    variableData.offsetsAndLengths.writeUInt16LE(buffer.length / 2);
    variableData.data.writeBuffer(buffer);
    return variableData.offset += buffer.length;
  }

  addVariableDataString(variableData, value) {
    value || (value = '');
    variableData.offsetsAndLengths.writeUInt16LE(variableData.offset);
    variableData.offsetsAndLengths.writeUInt16LE(value.length);
    variableData.data.writeString(value);
    return variableData.offset += value.length * 2;
  }

  createPasswordBuffer() {
    let password = this.loginData.password || '';
    password = new Buffer(password, 'ucs2');
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

  toString(indent) {
    indent || (indent = '');
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
