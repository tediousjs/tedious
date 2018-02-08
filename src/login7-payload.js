const WritableTrackingBuffer = require('./tracking-buffer/writable-tracking-buffer');
const os = require('os');
const sprintf = require('sprintf-js').sprintf;
const libraryName = require('./library').name;
const versions = require('./tds-versions').versions;
const assert = require('assert');

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
  UNKNOWN_COLLATION_HANDLING: 0x08,
  EXTENSION_USED: 0x10
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


const FEDAUTH_OPTIONS = {
  FEATURE_ID: 0x02,
  LIBRARY_SECURITYTOKEN: 0x01,
  LIBRARY_ADAL: 0x02,
  FEDAUTH_YES_ECHO: 0x01,
  FEDAUTH_NO_ECHO: 0x00,
  ADAL_WORKFLOW_USER_PASS: 0x01,
  ADAL_WORKFLOW_INTEGRATED: 0x02,
};
// TODO: add Secuirty token authentication

const FEATURE_EXT_TERMINATOR = 0xFF;
/*
  s2.2.6.3
 */
module.exports = class Login7Payload {
  constructor(loginData) {
    this.loginData = loginData;
    const lengthLength = 4;


    this.fedAuthPreloginRequired = (this.loginData.fedAuthInfo && this.loginData.fedAuthInfo.requiredPreLoginResponse);
    this.featureExt = undefined;
    if (this.fedAuthPreloginRequired) {
      this.featureExt = this.createFeatureExt();
    }
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
    const extUsed = this.fedAuthPreloginRequired;
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
    if (this.loginData.domain && !this.fedAuthPreloginRequired) {
      this.flags2 |= FLAGS_2.INTEGRATED_SECURITY_ON;
    } else {
      this.flags2 |= FLAGS_2.INTEGRATED_SECURITY_OFF;
    }
    this.flags3 = FLAGS_3.CHANGE_PASSWORD_NO | FLAGS_3.UNKNOWN_COLLATION_HANDLING;
    if (this.loginData.tdsVersion === '7_4' && extUsed) {
      this.flags3 |= FLAGS_3.EXTENSION_USED;
    }
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

    if (!this.loginData.domain) {
      this.sspi = '';
      this.sspiLong = 0;
    }
    this.attachDbFile = '';
    this.changePassword = '';
    this.addVariableDataString(variableData, this.hostname);
    this.addVariableDataString(variableData, (this.loginData.domain || this.fedAuthPreloginRequired) ? '' : this.loginData.userName);
    this.addVariableDataBuffer(variableData, (this.loginData.domain || this.fedAuthPreloginRequired) ? Buffer.alloc(0) : this.createPasswordBuffer());
    this.addVariableDataString(variableData, this.loginData.appName);
    this.addVariableDataString(variableData, this.loginData.serverName);
    let extensionPos = undefined;
    if (this.fedAuthPreloginRequired) {
      // hold the positon at which the FeaturExt offset is going to be written. We write 0 in the placeholder till the offset is available.
      extensionPos = this.addVariableDataInt32LE(variableData, 0);
    } else {
      this.addVariableDataString(variableData, '');
    }

    this.addVariableDataString(variableData, this.libraryName);
    this.addVariableDataString(variableData, this.loginData.language);
    this.addVariableDataString(variableData, this.loginData.database);
    variableData.offsetsAndLengths.writeBuffer(this.clientId);

    if (this.loginData.domain && !this.fedAuthPreloginRequired) {
      if (this.loginData.sspiBlob) {
        this.ntlmPacket = this.loginData.sspiBlob;
      } else {
        this.ntlmPacket = this.createNTLMRequest(this.loginData);
      }

      this.sspiLong = this.ntlmPacket.length;
      variableData.offsetsAndLengths.writeUInt16LE(variableData.offset);
      variableData.offsetsAndLengths.writeUInt16LE(this.ntlmPacket.length);
      variableData.data.writeBuffer(this.ntlmPacket);
      variableData.offset += this.ntlmPacket.length;
    } else {
      this.addVariableDataString(variableData, this.sspi);
    }

    this.addVariableDataString(variableData, this.attachDbFile);
    if (this.loginData.tdsVersion > '7_1') {
      this.addVariableDataString(variableData, this.changePassword);
      variableData.offsetsAndLengths.writeUInt32LE(this.sspiLong);
    }

    if (this.fedAuthPreloginRequired) {
      variableData.data.writeUInt32LEatPos(variableData.offset, extensionPos);
      return Buffer.concat([variableData.offsetsAndLengths.data, variableData.data.data, this.featureExt ]);
    }

    return Buffer.concat([variableData.offsetsAndLengths.data, variableData.data.data]);
  }

  createFeatureExt() {
    const buffer = new WritableTrackingBuffer(100);
    if ((this.loginData.fedAuthInfo.method.toUpperCase() === this.loginData.fedAuthInfo.ValidFedAuthEnum.ActiveDirectoryPassword) &&
    this.fedAuthPreloginRequired) {
      this.loginData.fedAuthInfo.fedAuthInfoRequested = true;
      this.loginData.fedAuthInfo.fedAuthLibrary = FEDAUTH_OPTIONS.LIBRARY_ADAL;
      this.createFedAuthExtData(buffer, this.loginData.fedAuthInfo);
    }
    buffer.writeUInt8(FEATURE_EXT_TERMINATOR);
    return buffer.data;
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

  addVariableDataInt32LE(variableData, value) {
    variableData.offsetsAndLengths.writeUInt16LE(variableData.offset);
    variableData.offsetsAndLengths.writeUInt16LE(4);
    // position at which the int value is written
    const position = variableData.data.getPos();
    variableData.data.writeUInt32LE(value);
    variableData.offset += 4;
    return position;
  }
  createNTLMRequest(options) {
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

  createFedAuthExtData(buffer, fedAuthInfo) {
    var dataLen = 0;
    switch (fedAuthInfo.fedAuthLibrary) {
      case FEDAUTH_OPTIONS.LIBRARY_ADAL:
        // length of feature data = 1 byte for library and echo + 1 byte for workflow
        dataLen = 2;
        break;
        // TODO: Security Token authentication datalen
      default:
        assert.fail();
    }

    // length of feature id (1 byte), data length field (4 bytes), and feature data (dataLen)
    buffer.writeUInt8(FEDAUTH_OPTIONS.FEATURE_ID); //FeatureId
    buffer.writeUInt32LE(dataLen); //FeatureDataLen
    let optionsByte = 0x00;
    switch (fedAuthInfo.fedAuthLibrary) {
      case FEDAUTH_OPTIONS.LIBRARY_ADAL:
        optionsByte |= FEDAUTH_OPTIONS.LIBRARY_ADAL << 1;
        break;
        // TODO: Security Token authentication
      default:
        assert.fail();
    }
    optionsByte |= (fedAuthInfo.requiredPreLoginResponse ? FEDAUTH_OPTIONS.FEDAUTH_YES_ECHO : FEDAUTH_OPTIONS.FEDAUTH_NO_ECHO);
    buffer.writeUInt8(optionsByte);

    let workflow = 0x00;
    switch (fedAuthInfo.fedAuthLibrary) {
      case FEDAUTH_OPTIONS.LIBRARY_ADAL:
        switch (fedAuthInfo.method.toUpperCase()) {
          case fedAuthInfo.ValidFedAuthEnum.ActiveDirectoryPassword:
            workflow = FEDAUTH_OPTIONS.ADAL_WORKFLOW_USER_PASS;
            break;
          // TODO: ActiveDirectoryIntegrated
          default:
            assert.fail();
        }
        break;
        // TODO: security token
      default:
        assert.fail();

    }
    buffer.writeUInt8(workflow);
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

  getNTLMFlags() {
    return NTLMFlags.NTLM_NegotiateUnicode + NTLMFlags.NTLM_NegotiateOEM + NTLMFlags.NTLM_RequestTarget + NTLMFlags.NTLM_NegotiateNTLM + NTLMFlags.NTLM_NegotiateOemDomainSupplied + NTLMFlags.NTLM_NegotiateOemWorkstationSupplied + NTLMFlags.NTLM_NegotiateAlwaysSign + NTLMFlags.NTLM_NegotiateVersion + NTLMFlags.NTLM_NegotiateExtendedSecurity + NTLMFlags.NTLM_Negotiate128 + NTLMFlags.NTLM_Negotiate56;
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
