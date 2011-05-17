var Packet = require('./packet').Packet,
    TYPE = require('./packet').TYPE,
    jspack = require('./jspack').jspack,
    textToUnicode = require('./unicode').textToUnicode;
    os = require('os'),
    
    FLAGS_1 = {
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
      SET_LANG_WARN_ON: 0x80,
    },
    flags1 =
      FLAGS_1.ENDIAN_LITTLE |
      FLAGS_1.CHARSET_ASCII |
      FLAGS_1.FLOAT_IEEE_754 |
      FLAGS_1.BCD_DUMPLOAD_ON |
      FLAGS_1.USE_DB_OFF |
      FLAGS_1.INIT_DB_WARN |
      FLAGS_1.SET_LANG_WARN_ON,

    FLAGS_2 = {
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
    },
    flags2 =
      FLAGS_2.INIT_LANG_WARN |
      FLAGS_2.ODBC_OFF |
      FLAGS_2.USER_NORMAL |
      FLAGS_2.INTEGRATED_SECURITY_OFF,
      
    TYPE_FLAGS = {
      SQL_DFLT: 0x00,
      SQL_TSQL: 0x01,
      
      OLEDB_OFF: 0x00,
      OLEDB_ON: 0x02
    },
    typeFlags =
      TYPE_FLAGS.SQL_DFLT |
      TYPE_FLAGS.OLEDB_OFF,
      
    FLAGS_3 = {
      CHANGE_PASSWORD_NO: 0x00,
      CHANGE_PASSWORD_YES: 0x01,
      
      BINARY_XML: 0x02,
      
      SPAWN_USER_INSTANCE: 0x04,

      UNKNOWN_COLLATION_HANDLING: 0x08
    },
    flags3 =
      FLAGS_3.CHANGE_PASSWORD_NO |
      FLAGS_3.UNKNOWN_COLLATION_HANDLING
      
    ;

var LoginPacket = function(headerFields, loginData) {
  var length,
      fixedData = buildFixedData(),
      variableData = buildVariableData(loginData, 8 + fixedData.length),
      data;

  length = jspack.Pack('<L', [4 + fixedData.length + variableData.length]);

  data = length;
  data = data.concat(fixedData)
  data = data.concat(variableData);
  
  return new Packet(TYPE.LOGIN7, data, headerFields);
};

LoginPacket.prototype.dataAsString = function() {
};

function buildFixedData() {
  var data = [],
      tdsVersion = 0x72090002,    // 7.2
      packetSize = 4 * 1024,
      clientProgVer = 0,
      clientPid = 0,
      connectionId = 0,
      clientTimeZone = new Date().getTimezoneOffset();
      clientLcid = 0 ;            // Can't figure what form this should take.
  
  data = data.concat(jspack.Pack('<L<L<L<L<L', [tdsVersion, packetSize, clientProgVer, clientPid, connectionId]));
  data = data.concat(jspack.Pack('BBBB', [flags1, flags2, typeFlags, flags3]));
  data = data.concat(jspack.Pack('<l', [clientTimeZone]));
  data = data.concat(jspack.Pack('<L', [clientLcid]));
  
  return data;
}

function buildVariableData(loginData, offset) {
  var variableData = {
        dataOffsetsAndLengths: [],
        data: [],
        offset: offset + ((9 * 4) + 6 + (3 * 4))
      };
  
  loginData = loginData || {};
  loginData.appName = loginData.appName || 'Tedious';

  addVariableDataOffsetLength(variableData, os.hostname());
  addVariableDataOffsetLength(variableData, loginData.userName);
  addVariableDataPassword(variableData, loginData.password);
  addVariableDataOffsetLength(variableData, loginData.appName);
  addVariableDataOffsetLength(variableData, loginData.serverName);
  addVariableDataOffsetLength(variableData, '');                        // Reserved for future use.
  addVariableDataOffsetLength(variableData, 'Tedious');
  addVariableDataOffsetLength(variableData, loginData.language);
  addVariableDataOffsetLength(variableData, loginData.database);
  addVariableDataBytes(variableData, [1, 2, 3, 4, 5, 6]);               // Client ID, should be MAC address.
  addVariableDataOffsetLength(variableData, '');                        // SSPI (NT authentication).
  addVariableDataOffsetLength(variableData, '');                        // Attach database.
  addVariableDataOffsetLength(variableData, '');                        // Change password.
  addVariableDataDword(variableData, 0);                                // cbSSPILong
  
  return variableData.dataOffsetsAndLengths.concat(variableData.data);
}

function addVariableDataOffsetLength(variableData, field) {
  field = field || '';
  
  var offsetAndLength = jspack.Pack('<H<H', [variableData.offset, field.length]),
      fieldData = textToUnicode(field);

  variableData.dataOffsetsAndLengths = variableData.dataOffsetsAndLengths.concat(offsetAndLength);
  variableData.data = variableData.data.concat(fieldData);
  variableData.offset += fieldData.length;
}

function addVariableDataPassword(variableData, field) {
  var start = variableData.data.length,
      end,
      b,
      byte;

  addVariableDataOffsetLength(variableData, field);
  end = variableData.data.length;

  for (b = start; b < end; b++) {
    var lowNibble,
        highNibble;
    
    byte = variableData.data[b];
    
    // Swap nibbles.
    lowNibble = byte & 0x0f;
    highNibble = (byte >> 4);
    byte = (lowNibble << 4) | highNibble;
    
    byte = byte ^ 0xa5;
    
    variableData.data[b] = byte;
  }
}

function addVariableDataBytes(variableData, bytes) {
  variableData.dataOffsetsAndLengths = variableData.dataOffsetsAndLengths.concat(bytes);
}

function addVariableDataDword(variableData, dword) {
  var dwordArray = jspack.Pack('<L', [dword]);

  variableData.dataOffsetsAndLengths = variableData.dataOffsetsAndLengths.concat(dwordArray);
}

exports.LoginPacket = LoginPacket;
