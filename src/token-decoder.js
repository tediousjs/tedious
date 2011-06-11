var jspack = require('./jspack').jspack,
    EventEmitter = require("events").EventEmitter,
    inherits = require('util').inherits,
    unicodeToText = require('./unicode').unicodeToText,
    DONE_STATUSES = require('./token').DONE_STATUSES,
    
    COLMETADATA_FLAGS = {
      NULLABLE: 0x0001,
      CASE_SENSISTIVE: 0x0002,
      READ_WRITE: 0x0004,
      IDENTITY: 0x0010,
      COMPUTED: 0x0020,
      FIXED_LEN_CLR_TYPE: 0x0100,
      HIDDEN: 0x2000,
      KEY: 0x4000,
      NULLABLE_UNKNOWN: 0x8000
    }
    ;

var TokenDecoder = function() {
  EventEmitter.call(this);
}

inherits(TokenDecoder, EventEmitter);

TokenDecoder.prototype.decode = function(data) {
  var tokenType;

  this.data = data;
  this.offset = 0;

  while (this.offset < data.length) {
    tokenType = data[this.offset];
    this.offset++;

    switch (tokenType) {
    case 0x81:
      this.emit('colMetadata', this.createColMetadata());
      break;
    case 0xAA:
      this.emit('error_', this.createError());
      break;
    case 0xAB:
      this.emit('info', this.createInfo());
      break;
    case 0xAD:
      this.emit('loginAck', this.createLoginAck());
      break;
    case 0xE3:
      this.emit('envChange', this.createEnvChange());
      break;
    case 0xFD:
      this.emit('done', this.createDone());
      break;
    case 0xFF:
      this.emit('doneInProc', this.createDone());
      break;
    default:
      this.emit('unknown', 'tokenType: ' + tokenType);
      this.emit('end');
      return;
    }
  }

  this.emit('end');
}

TokenDecoder.prototype.createColMetadata = function() {
  var columnCount,
      columnNumber,
      NO_METADATA = 0xffff,
      colMetadata = [],
      column,
      flags,
      dataType;
  
  columnCount = jspack.Unpack('<H', this.data, this.offset)[0];
  this.offset += 2;
  if (columnCount == NO_METADATA) {
    columnCount = 0;
  }

  for (columnNumber = 0; columnNumber < columnCount; columnNumber++) {
    column = {};
    
    column.userType = jspack.Unpack('<L', this.data, this.offset)[0];
    this.offset += 4;
    
    flags = jspack.Unpack('<H', this.data, this.offset)[0];
    this.offset += 2;
    column.nullable = Boolean(flags & COLMETADATA_FLAGS.NULLABLE);
    column.caseSensitive = Boolean(flags & COLMETADATA_FLAGS.CASE_SENSISTIVE);
    column.readOnly = !Boolean(flags & COLMETADATA_FLAGS.READ_WRITE);
    column.identity = Boolean(flags & COLMETADATA_FLAGS.IDENTITY);
    column.computed = Boolean(flags & COLMETADATA_FLAGS.COMPUTED);
    column.fixedLengthClrUdt= Boolean(flags & COLMETADATA_FLAGS.FIXED_LEN_CLR_TYPE);
    column.hidden= Boolean(flags & COLMETADATA_FLAGS.HIDDEN);
    column.key = Boolean(flags & COLMETADATA_FLAGS.KEY);
    column.nullableUnknown = Boolean(flags & COLMETADATA_FLAGS.NULLABLE_UNKNOWN);

    column.type = this.getDataType();
    
    column.name = this.bVarchar(this.offset);
    this.offset += 1 + (2 * column.name.length);

    colMetadata.push(column);
  }
 
  return colMetadata;
}

TokenDecoder.prototype.getDataType = function() {
  var variableUShortLenTypes = {
        0xE7: 'NVarChar',
        0xA7: 'VarChar',
        0xAF: 'Char'
      },
      type = jspack.Unpack('B', this.data, this.offset)[0],
      dataType = {};
  
  this.offset++;
  
  if (variableUShortLenTypes[type]) {
    dataType.name = variableUShortLenTypes[type];
    dataType.lengthUnpack = '<H';
    dataType.lengthBytes = 2;
    dataType.length = jspack.Unpack(dataType.lengthUnpack, this.data, this.offset)[0];
    this.offset += 2;
    // skip collation
    this.offset += 5;
  } else {
    console.log('unknown type : ' + type);
    dataType.name = 'UNKNOWN:' + type;
  }
  
  return dataType;
}

TokenDecoder.prototype.createLoginAck = function() {
  var offset = this.offset,
      unpacked,
      length,
      varcharLength,
      loginAck = {};
  
  unpacked = jspack.Unpack('<HB<l', this.data, offset);
  length = unpacked[0];
  loginAck.interfaceType = unpacked[1];
  loginAck.tdsVersion = unpacked[2];
  offset += 7;
 
  loginAck.progName = this.bVarchar(offset);
  offset += 1 + (2 * loginAck.progName.length);

  loginAck.progVersion = {};
  loginAck.progVersion.major = this.data[offset + 0];
  loginAck.progVersion.minor = this.data[offset + 1];
  loginAck.progVersion.buildNumberHigh = this.data[offset + 2];
  loginAck.progVersion.buildNumberLow = this.data[offset + 3];
  loginAck.progVersion.string =
    loginAck.progVersion.major + '.' +
    loginAck.progVersion.minor + '.' +
    loginAck.progVersion.buildNumberHigh + '.' +
    loginAck.progVersion.buildNumberLow;

  this.offset += 2 + length;
  
  return loginAck;
}

TokenDecoder.prototype.createEnvChange = function() {
  var offset = this.offset,
      unpacked,
      type,
      length,
      envChange = {};
  
  unpacked = jspack.Unpack('<HB', this.data, offset);
  length = unpacked[0];
  offset += 3;

  type = unpacked[1];
  switch (type) {
  case 1:
    envChange.type = 'database';
    envChange.newValue = this.bVarchar(offset);
    offset += 1 + (2 * envChange.newValue.length)
    envChange.oldValue = this.bVarchar(offset);
    break;
  case 2:
    envChange.type = 'language';
    envChange.newValue = this.bVarchar(offset);
    offset += 1 + (2 * envChange.newValue.length)
    envChange.oldValue = this.bVarchar(offset);
    break;
  case 4:
    envChange.type = 'packetSize';
    envChange.newValue = this.bVarchar(offset);
    offset += 1 + (2 * envChange.newValue.length)
    envChange.oldValue = this.bVarchar(offset);
    break;
  case 7:
    envChange.type = 'sqlCollation';
    envChange.newValue = this.bVarbyte(offset);
    offset += 1 + envChange.newValue.length
    envChange.oldValue = this.bVarbyte(offset);
    break;
  default:
    this.emit('unknown', 'ENVCHANGE type: ' + type);
  }
  
  this.offset += 2 + length;
  
  return envChange;
}

TokenDecoder.prototype.createError = function() {
  return this.createInfo();
}

TokenDecoder.prototype.createInfo = function() {
  var offset = this.offset,
      unpacked,
      length,
      info = {};
  
  unpacked = jspack.Unpack('<H<lBB', this.data, offset);
  length = unpacked[0];
  info.number = unpacked[1];
  info.state = unpacked[2];
  info.class = unpacked[3];
  offset += 8;

  info.messageText = this.usVarchar(offset);
  offset += 2 + (2 * info.messageText.length);

  info.serverName = this.bVarchar(offset);
  offset += 1 + (2 * info.serverName.length);

  info.procName = this.bVarchar(offset);
  offset += 1 + (2 * info.procName.length);

  unpacked = jspack.Unpack('<l', this.data, offset);
  info.lineNumber = unpacked[0];

  this.offset += 2 + length;
  
  return info;
}

TokenDecoder.prototype.createDone = function() {
  var offset = this.offset,
      unpacked,
      done = {};
  
  unpacked = jspack.Unpack('<H<H<L<L', this.data, offset);
  done.status = unpacked[0];
  done.statusText = DONE_STATUSES[done.status];
  done.currentCommandToken = unpacked[1];
  done.rowCount = unpacked[2];
  // The high 4 bytes of the row count are currently ignored, as Javascript
  // can't represent a 64 bit integer.

  this.offset += 12;
  
  return done;
}

TokenDecoder.prototype.bVarbyte = function(offset) {
  var length = this.data[offset];
  
  return this.data.slice(offset + 1, offset + 1 + length);
}

TokenDecoder.prototype.bVarchar = function(offset) {
  var length = 2 * this.data[offset];
  
  return unicodeToText(this.data, length, offset + 1);
}

TokenDecoder.prototype.usVarchar = function(offset) {
  var length = 2 * jspack.Unpack('<H', this.data, offset)[0];
  
  return unicodeToText(this.data, length, offset + 2);
}

exports.TokenDecoder = TokenDecoder;
