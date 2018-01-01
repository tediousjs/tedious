const guidParser = require('./guid-parser');

const NULL = (1 << 16) - 1;
const EPOCH_DATE = new Date(1900, 0, 1);
const UTC_EPOCH_DATE = new Date(Date.UTC(1900, 0, 1));
const YEAR_ONE = new Date(2000, 0, -730118);
const UTC_YEAR_ONE = Date.UTC(2000, 0, -730118);
const MAX = (1 << 16) - 1;

const typeByName = module.exports.typeByName = {};

const Null = {
  type: 'NULL',
  name: 'Null'
};

const TinyInt = {
  type: 'INT1',
  name: 'TinyInt',

  declaration: function() {
    return 'tinyint';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(typeByName.IntN.id);
    buffer.writeUInt8(1);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(1);
      buffer.writeUInt8(parseInt(parameter.value));
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    value = parseInt(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    if (value < 0 || value > 255) {
      return new TypeError('Value must be between 0 and 255.');
    }
    return value;
  }
};

const Bit = {
  type: 'BIT',
  name: 'Bit',

  declaration: function() {
    return 'bit';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(typeByName.BitN.id);
    buffer.writeUInt8(1);
  },

  writeParameterData: function(buffer, parameter) {
    if (typeof parameter.value === 'undefined' || parameter.value === null) {
      buffer.writeUInt8(0);
    } else {
      buffer.writeUInt8(1);
      buffer.writeUInt8(parameter.value ? 1 : 0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (value) {
      return true;
    } else {
      return false;
    }
  }
};

const SmallInt = {
  type: 'INT2',
  name: 'SmallInt',

  declaration: function() {
    return 'smallint';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(typeByName.IntN.id);
    buffer.writeUInt8(2);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(2);
      buffer.writeInt16LE(parseInt(parameter.value));
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    value = parseInt(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    if (value < -32768 || value > 32767) {
      return new TypeError('Value must be between -32768 and 32767.');
    }
    return value;
  }
};

const Int = {
  type: 'INT4',
  name: 'Int',

  declaration: function() {
    return 'int';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(typeByName.IntN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(4);
      buffer.writeInt32LE(parseInt(parameter.value));
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    value = parseInt(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    if (value < -2147483648 || value > 2147483647) {
      return new TypeError('Value must be between -2147483648 and 2147483647.');
    }
    return value;
  }
};

const SmallDateTime = {
  type: 'DATETIM4',
  name: 'SmallDateTime',

  declaration: function() {
    return 'smalldatetime';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(typeByName.DateTimeN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer, parameter, options) {
    if (parameter.value != null) {
      let days, dstDiff, minutes;
      if (options.useUTC) {
        days = Math.floor((parameter.value.getTime() - UTC_EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
        minutes = (parameter.value.getUTCHours() * 60) + parameter.value.getUTCMinutes();
      } else {
        dstDiff = -(parameter.value.getTimezoneOffset() - EPOCH_DATE.getTimezoneOffset()) * 60 * 1000;
        days = Math.floor((parameter.value.getTime() - EPOCH_DATE.getTime() + dstDiff) / (1000 * 60 * 60 * 24));
        minutes = (parameter.value.getHours() * 60) + parameter.value.getMinutes();
      }

      buffer.writeUInt8(4);
      buffer.writeUInt16LE(days);

      buffer.writeUInt16LE(minutes);
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }

    if (!(value instanceof Date)) {
      value = Date.parse(value);
    }

    if (isNaN(value)) {
      return new TypeError('Invalid date.');
    }

    return value;
  }
};

const Real = {
  type: 'FLT4',
  name: 'Real',

  declaration: function() {
    return 'real';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(typeByName.FloatN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(4);
      buffer.writeFloatLE(parseFloat(parameter.value));
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    return value;
  }
};

const Money = {
  type: 'MONEY',
  name: 'Money',

  declaration: function() {
    return 'money';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(typeByName.MoneyN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(8);
      buffer.writeMoney(parameter.value * 10000);
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    return value;
  }
};

const DateTime = {
  type: 'DATETIME',
  name: 'DateTime',

  declaration: function() {
    return 'datetime';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(typeByName.DateTimeN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer, parameter, options) {
    if (parameter.value != null) {
      let days, dstDiff, milliseconds, seconds, threeHundredthsOfSecond;
      if (options.useUTC) {
        days = Math.floor((parameter.value.getTime() - UTC_EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
        seconds = parameter.value.getUTCHours() * 60 * 60;
        seconds += parameter.value.getUTCMinutes() * 60;
        seconds += parameter.value.getUTCSeconds();
        milliseconds = (seconds * 1000) + parameter.value.getUTCMilliseconds();
      } else {
        dstDiff = -(parameter.value.getTimezoneOffset() - EPOCH_DATE.getTimezoneOffset()) * 60 * 1000;
        days = Math.floor((parameter.value.getTime() - EPOCH_DATE.getTime() + dstDiff) / (1000 * 60 * 60 * 24));
        seconds = parameter.value.getHours() * 60 * 60;
        seconds += parameter.value.getMinutes() * 60;
        seconds += parameter.value.getSeconds();
        milliseconds = (seconds * 1000) + parameter.value.getMilliseconds();
      }

      threeHundredthsOfSecond = milliseconds / (3 + (1 / 3));
      threeHundredthsOfSecond = Math.round(threeHundredthsOfSecond);

      buffer.writeUInt8(8);
      buffer.writeInt32LE(days);

      buffer.writeUInt32LE(threeHundredthsOfSecond);
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (!(value instanceof Date)) {
      value = Date.parse(value);
    }
    if (isNaN(value)) {
      return new TypeError('Invalid date.');
    }
    return value;
  }
};

const Float = {
  type: 'FLT8',
  name: 'Float',

  declaration: function() {
    return 'float';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(typeByName.FloatN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(8);
      buffer.writeDoubleLE(parseFloat(parameter.value));
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    return value;
  }
};

const Decimal = {
  type: 'DECIMAL',
  name: 'Decimal',
  hasPrecision: true,
  hasScale: true,

  declaration: function(parameter) {
    return 'decimal(' + (this.resolvePrecision(parameter)) + ', ' + (this.resolveScale(parameter)) + ')';
  },

  resolvePrecision: function(parameter) {
    if (parameter.precision != null) {
      return parameter.precision;
    } else if (parameter.value === null) {
      return 1;
    } else {
      return 18;
    }
  },

  resolveScale: function(parameter) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else {
      return 0;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(typeByName.DecimalN.id);
    if (parameter.precision <= 9) {
      buffer.writeUInt8(5);
    } else if (parameter.precision <= 19) {
      buffer.writeUInt8(9);
    } else if (parameter.precision <= 28) {
      buffer.writeUInt8(13);
    } else {
      buffer.writeUInt8(17);
    }
    buffer.writeUInt8(parameter.precision);
    buffer.writeUInt8(parameter.scale);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      const sign = parameter.value < 0 ? 0 : 1;
      const value = Math.round(Math.abs(parameter.value * Math.pow(10, parameter.scale)));
      if (parameter.precision <= 9) {
        buffer.writeUInt8(5);
        buffer.writeUInt8(sign);
        buffer.writeUInt32LE(value);
      } else if (parameter.precision <= 19) {
        buffer.writeUInt8(9);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(value);
      } else if (parameter.precision <= 28) {
        buffer.writeUInt8(13);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(value);
        buffer.writeUInt32LE(0x00000000);
      } else {
        buffer.writeUInt8(17);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(value);
        buffer.writeUInt32LE(0x00000000);
        buffer.writeUInt32LE(0x00000000);
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    return value;
  }
};

const Numeric = {
  type: 'NUMERIC',
  name: 'Numeric',
  hasPrecision: true,
  hasScale: true,

  declaration: function(parameter) {
    return 'numeric(' + (this.resolvePrecision(parameter)) + ', ' + (this.resolveScale(parameter)) + ')';
  },

  resolvePrecision: function(parameter) {
    if (parameter.precision != null) {
      return parameter.precision;
    } else if (parameter.value === null) {
      return 1;
    } else {
      return 18;
    }
  },

  resolveScale: function(parameter) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else {
      return 0;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(typeByName.NumericN.id);
    if (parameter.precision <= 9) {
      buffer.writeUInt8(5);
    } else if (parameter.precision <= 19) {
      buffer.writeUInt8(9);
    } else if (parameter.precision <= 28) {
      buffer.writeUInt8(13);
    } else {
      buffer.writeUInt8(17);
    }
    buffer.writeUInt8(parameter.precision);
    buffer.writeUInt8(parameter.scale);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      const sign = parameter.value < 0 ? 0 : 1;
      const value = Math.round(Math.abs(parameter.value * Math.pow(10, parameter.scale)));
      if (parameter.precision <= 9) {
        buffer.writeUInt8(5);
        buffer.writeUInt8(sign);
        buffer.writeUInt32LE(value);
      } else if (parameter.precision <= 19) {
        buffer.writeUInt8(9);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(value);
      } else if (parameter.precision <= 28) {
        buffer.writeUInt8(13);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(value);
        buffer.writeUInt32LE(0x00000000);
      } else {
        buffer.writeUInt8(17);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(value);
        buffer.writeUInt32LE(0x00000000);
        buffer.writeUInt32LE(0x00000000);
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    return value;
  }
};

const SmallMoney = {
  type: 'MONEY4',
  name: 'SmallMoney',

  declaration: function() {
    return 'smallmoney';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(typeByName.MoneyN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(4);
      buffer.writeInt32LE(parameter.value * 10000);
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    if (value < -214748.3648 || value > 214748.3647) {
      return new TypeError('Value must be between -214748.3648 and 214748.3647.');
    }
    return value;
  }
};

const BigInt = {
  type: 'INT8',
  name: 'BigInt',

  declaration: function() {
    return 'bigint';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(typeByName.IntN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      const val = typeof parameter.value !== 'number' ? parameter.value : parseInt(parameter.value);
      buffer.writeUInt8(8);
      buffer.writeInt64LE(val);
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    if (value < -9007199254740991 || value > 9007199254740991) {
      // Number.MIN_SAFE_INTEGER = -9007199254740991
      // Number.MAX_SAFE_INTEGER = 9007199254740991
      // 9007199254740991 = (2**53) - 1
      // Can't use Number.MIN_SAFE_INTEGER and Number.MAX_SAFE_INTEGER directly though
      // as these constants are not available in node 0.10.
      return new TypeError('Value must be between -9007199254740991 and 9007199254740991, inclusive.' +
        ' For bigger numbers, use VarChar type.');
    }
    return value;
  }
};

const Image = {
  type: 'IMAGE',
  name: 'Image',
  hasTableName: true,
  hasTextPointerAndTimestamp: true,
  dataLengthLength: 4,

  declaration: function() {
    return 'image';
  },

  resolveLength: function(parameter) {
    if (parameter.value != null) {
      return parameter.value.length;
    } else {
      return -1;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeInt32LE(parameter.length);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeInt32LE(parameter.length);
      buffer.writeBuffer(parameter.value);
    } else {
      buffer.writeInt32LE(parameter.length);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (!Buffer.isBuffer(value)) {
      return new TypeError('Invalid buffer.');
    }
    return value;
  }
};

const Text = {
  type: 'TEXT',
  name: 'Text',
  hasCollation: true,
  hasTableName: true,
  hasTextPointerAndTimestamp: true,
  dataLengthLength: 4,

  declaration: function() {
    return 'text';
  },

  resolveLength: function(parameter) {
    if (parameter.value != null) {
      return parameter.value.length;
    } else {
      return -1;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(typeByName.Text.id);
    buffer.writeInt32LE(parameter.length);
  },

  writeParameterData: function(buffer, parameter) {
    buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]));
    if (parameter.value != null) {
      buffer.writeInt32LE(parameter.length);
      buffer.writeString(parameter.value.toString(), 'ascii');
    } else {
      buffer.writeInt32LE(parameter.length);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (typeof value !== 'string') {
      if (typeof value.toString !== 'function') {
        return TypeError('Invalid string.');
      }
      value = value.toString();
    }
    return value;
  }
};

const UniqueIdentifierN = {
  type: 'GUIDN',
  name: 'UniqueIdentifierN',
  aliases: ['UniqueIdentifier'],
  dataLengthLength: 1,

  declaration: function() {
    return 'uniqueidentifier';
  },

  resolveLength: function() {
    return 16;
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(typeByName.UniqueIdentifierN.id);
    buffer.writeUInt8(0x10);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(0x10);
      buffer.writeBuffer(new Buffer(guidParser.guidToArray(parameter.value)));
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (typeof value !== 'string') {
      if (typeof value.toString !== 'function') {
        return TypeError('Invalid string.');
      }
      value = value.toString();
    }
    return value;
  }
};

const IntN = {
  type: 'INTN',
  name: 'IntN',
  dataLengthLength: 1
};

const NText = {
  type: 'NTEXT',
  name: 'NText',
  hasCollation: true,
  hasTableName: true,
  hasTextPointerAndTimestamp: true,
  dataLengthLength: 4
};

const BitN = {
  type: 'BITN',
  name: 'BitN',
  dataLengthLength: 1
};

const DecimalN = {
  type: 'DECIMALN',
  name: 'DecimalN',
  dataLengthLength: 1,
  hasPrecision: true,
  hasScale: true
};

const NumericN = {
  type: 'NUMERICN',
  name: 'NumericN',
  dataLengthLength: 1,
  hasPrecision: true,
  hasScale: true
};

const FloatN = {
  type: 'FLTN',
  name: 'FloatN',
  dataLengthLength: 1
};

const MoneyN = {
  type: 'MONEYN',
  name: 'MoneyN',
  dataLengthLength: 1
};

const DateTimeN = {
  type: 'DATETIMN',
  name: 'DateTimeN',
  dataLengthLength: 1
};

const VarBinary = {
  type: 'BIGVARBIN',
  name: 'VarBinary',
  dataLengthLength: 2,
  maximumLength: 8000,

  declaration: function(parameter) {
    let length;
    if (parameter.length) {
      length = parameter.length;
    } else if (parameter.value != null) {
      length = parameter.value.length || 1;
    } else if (parameter.value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }

    if (length <= this.maximumLength) {
      return 'varbinary(' + length + ')';
    } else {
      return 'varbinary(max)';
    }
  },

  resolveLength: function(parameter) {
    if (parameter.length != null) {
      return parameter.length;
    } else if (parameter.value != null) {
      return parameter.value.length;
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    if (parameter.length <= this.maximumLength) {
      buffer.writeUInt16LE(this.maximumLength);
    } else {
      buffer.writeUInt16LE(MAX);
    }
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      if (parameter.length <= this.maximumLength) {
        buffer.writeUsVarbyte(parameter.value);
      } else {
        buffer.writePLPBody(parameter.value);
      }
    } else {
      if (parameter.length <= this.maximumLength) {
        buffer.writeUInt16LE(NULL);
      } else {
        buffer.writeUInt32LE(0xFFFFFFFF);
        buffer.writeUInt32LE(0xFFFFFFFF);
      }
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (!Buffer.isBuffer(value)) {
      return new TypeError('Invalid buffer.');
    }
    return value;
  }
};

const VarChar = {
  type: 'BIGVARCHR',
  name: 'VarChar',
  hasCollation: true,
  dataLengthLength: 2,
  maximumLength: 8000,

  declaration: function(parameter) {
    let length;
    if (parameter.length) {
      length = parameter.length;
    } else if (parameter.value != null) {
      length = parameter.value.toString().length || 1;
    } else if (parameter.value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }

    if (length <= this.maximumLength) {
      return 'varchar(' + length + ')';
    } else {
      return 'varchar(max)';
    }
  },

  resolveLength: function(parameter) {
    if (parameter.length != null) {
      return parameter.length;
    } else if (parameter.value != null) {
      if (Buffer.isBuffer(parameter.value)) {
        return parameter.value.length || 1;
      } else {
        return parameter.value.toString().length || 1;
      }
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    if (parameter.length <= this.maximumLength) {
      buffer.writeUInt16LE(this.maximumLength);
    } else {
      buffer.writeUInt16LE(MAX);
    }
    buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]));
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      if (parameter.length <= this.maximumLength) {
        buffer.writeUsVarbyte(parameter.value, 'ascii');
      } else {
        buffer.writePLPBody(parameter.value, 'ascii');
      }
    } else {
      if (parameter.length <= this.maximumLength) {
        buffer.writeUInt16LE(NULL);
      } else {
        buffer.writeUInt32LE(0xFFFFFFFF);
        buffer.writeUInt32LE(0xFFFFFFFF);
      }
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (typeof value !== 'string') {
      if (typeof value.toString !== 'function') {
        return TypeError('Invalid string.');
      }
      value = value.toString();
    }
    return value;
  }
};

const Binary = {
  type: 'BIGBinary',
  name: 'Binary',
  dataLengthLength: 2,
  maximumLength: 8000,

  declaration: function(parameter) {
    var length;
    if (parameter.length) {
      length = parameter.length;
    } else if (parameter.value != null) {
      length = parameter.value.length || 1;
    } else if (parameter.value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }
    return 'binary(' + length + ')';
  },

  resolveLength: function(parameter) {
    if (parameter.value != null) {
      return parameter.value.length;
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt16LE(parameter.length);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt16LE(parameter.length);
      buffer.writeBuffer(parameter.value.slice(0, Math.min(parameter.length, this.maximumLength)));
    } else {
      buffer.writeUInt16LE(NULL);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (!Buffer.isBuffer(value)) {
      return new TypeError('Invalid buffer.');
    }
    return value;
  }
};

const Char = {
  type: 'BIGCHAR',
  name: 'Char',
  hasCollation: true,
  dataLengthLength: 2,
  maximumLength: 8000,

  declaration: function(parameter) {
    let length;
    if (parameter.length) {
      length = parameter.length;
    } else if (parameter.value != null) {
      length = parameter.value.toString().length || 1;
    } else if (parameter.value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }

    if (length < this.maximumLength) {
      return 'char(' + length + ')';
    } else {
      return 'char(' + this.maximumLength + ')';
    }
  },

  resolveLength: function(parameter) {
    if (parameter.length != null) {
      return parameter.length;
    } else if (parameter.value != null) {
      if (Buffer.isBuffer(parameter.value)) {
        return parameter.value.length || 1;
      } else {
        return parameter.value.toString().length || 1;
      }
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt16LE(parameter.length);
    buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]));
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUsVarbyte(parameter.value, 'ascii');
    } else {
      buffer.writeUInt16LE(NULL);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (typeof value !== 'string') {
      if (typeof value.toString !== 'function') {
        return TypeError('Invalid string.');
      }
      value = value.toString();
    }
    return value;
  }
};

const NVarChar = {
  type: 'NVARCHAR',
  name: 'NVarChar',
  hasCollation: true,
  dataLengthLength: 2,
  maximumLength: 4000,

  declaration: function(parameter) {
    let length;
    if (parameter.length) {
      length = parameter.length;
    } else if (parameter.value != null) {
      length = parameter.value.toString().length || 1;
    } else if (parameter.value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }

    if (length <= this.maximumLength) {
      return 'nvarchar(' + length + ')';
    } else {
      return 'nvarchar(max)';
    }
  },

  resolveLength: function(parameter) {
    if (parameter.length != null) {
      return parameter.length;
    } else if (parameter.value != null) {
      if (Buffer.isBuffer(parameter.value)) {
        return (parameter.value.length / 2) || 1;
      } else {
        return parameter.value.toString().length || 1;
      }
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    if (parameter.length <= this.maximumLength) {
      buffer.writeUInt16LE(parameter.length * 2);
    } else {
      buffer.writeUInt16LE(MAX);
    }
    buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]));
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      if (parameter.length <= this.maximumLength) {
        buffer.writeUsVarbyte(parameter.value, 'ucs2');
      } else {
        buffer.writePLPBody(parameter.value, 'ucs2');
      }
    } else {
      if (parameter.length <= this.maximumLength) {
        buffer.writeUInt16LE(NULL);
      } else {
        buffer.writeUInt32LE(0xFFFFFFFF);
        buffer.writeUInt32LE(0xFFFFFFFF);
      }
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (typeof value !== 'string') {
      if (typeof value.toString !== 'function') {
        return TypeError('Invalid string.');
      }
      value = value.toString();
    }
    return value;
  }
};

const NChar = {
  type: 'NCHAR',
  name: 'NChar',
  hasCollation: true,
  dataLengthLength: 2,
  maximumLength: 4000,

  declaration: function(parameter) {
    let length;
    if (parameter.length) {
      length = parameter.length;
    } else if (parameter.value != null) {
      length = parameter.value.toString().length || 1;
    } else if (parameter.value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }

    if (length < this.maximumLength) {
      return 'nchar(' + length + ')';
    } else {
      return 'nchar(' + this.maximumLength + ')';
    }
  },

  resolveLength: function(parameter) {
    if (parameter.length != null) {
      return parameter.length;
    } else if (parameter.value != null) {
      if (Buffer.isBuffer(parameter.value)) {
        return (parameter.value.length / 2) || 1;
      } else {
        return parameter.value.toString().length || 1;
      }
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt16LE(parameter.length * 2);
    buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]));
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUsVarbyte(parameter.value, 'ucs2');
    } else {
      buffer.writeUInt16LE(NULL);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (typeof value !== 'string') {
      if (typeof value.toString !== 'function') {
        return TypeError('Invalid string.');
      }
      value = value.toString();
    }
    return value;
  }
};

const Xml = {
  type: 'XML',
  name: 'Xml',
  hasSchemaPresent: true
};

const TimeN = {
  type: 'TIMEN',
  name: 'TimeN',
  aliases: ['Time'],
  hasScale: true,
  dataLengthLength: 1,

  dataLengthFromScale: function(scale) {
    switch (scale) {
      case 0:
      case 1:
      case 2:
        return 3;
      case 3:
      case 4:
        return 4;
      case 5:
      case 6:
      case 7:
        return 5;
    }
  },

  declaration: function(parameter) {
    return 'time(' + (this.resolveScale(parameter)) + ')';
  },

  resolveScale: function(parameter) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else if (parameter.value === null) {
      return 0;
    } else {
      return 7;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt8(parameter.scale);
  },

  writeParameterData: function(buffer, parameter, options) {
    if (parameter.value != null) {
      const time = new Date(+parameter.value);

      let timestamp;
      if (options.useUTC) {
        timestamp = ((time.getUTCHours() * 60 + time.getUTCMinutes()) * 60 + time.getUTCSeconds()) * 1000 + time.getUTCMilliseconds();
      } else {
        timestamp = ((time.getHours() * 60 + time.getMinutes()) * 60 + time.getSeconds()) * 1000 + time.getMilliseconds();
      }

      timestamp = timestamp * Math.pow(10, parameter.scale - 3);
      timestamp += (parameter.value.nanosecondDelta != null ? parameter.value.nanosecondDelta : 0) * Math.pow(10, parameter.scale);
      timestamp = Math.round(timestamp);

      switch (parameter.scale) {
        case 0:
        case 1:
        case 2:
          buffer.writeUInt8(3);
          buffer.writeUInt24LE(timestamp);
        case 3:
        case 4:
          buffer.writeUInt8(4);
          buffer.writeUInt32LE(timestamp);
        case 5:
        case 6:
        case 7:
          buffer.writeUInt8(5);
          buffer.writeUInt40LE(timestamp);
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    value = Date.parse(value);
    if (isNaN(value)) {
      return new TypeError('Invalid time.');
    }
    return value;
  }
};

const DateN = {
  type: 'DATEN',
  name: 'DateN',
  aliases: ['Date'],
  dataLengthLength: 1,
  fixedDataLength: 3,

  declaration: function() {
    return 'date';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(this.id);
  },

  writeParameterData: function(buffer, parameter, options) {
    if (parameter.value != null) {
      buffer.writeUInt8(3);
      if (options.useUTC) {
        buffer.writeUInt24LE(Math.floor((+parameter.value - UTC_YEAR_ONE) / 86400000));
      } else {
        const dstDiff = -(parameter.value.getTimezoneOffset() - YEAR_ONE.getTimezoneOffset()) * 60 * 1000;
        buffer.writeUInt24LE(Math.floor((+parameter.value - YEAR_ONE + dstDiff) / 86400000));
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (!(value instanceof Date)) {
      value = Date.parse(value);
    }
    if (isNaN(value)) {
      return new TypeError('Invalid date.');
    }
    return value;
  }
};

const DateTime2N = {
  type: 'DATETIME2N',
  name: 'DateTime2N',
  aliases: ['DateTime2'],
  hasScale: true,
  dataLengthLength: 1,

  dataLengthFromScale: function(scale) {
    switch (scale) {
      case 0:
      case 1:
      case 2:
        return 3;
      case 3:
      case 4:
        return 4;
      case 5:
      case 6:
      case 7:
        return 5;
    }
  },

  declaration: function(parameter) {
    return 'datetime2(' + (this.resolveScale(parameter)) + ')';
  },

  resolveScale: function(parameter) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else if (parameter.value === null) {
      return 0;
    } else {
      return 7;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt8(parameter.scale);
  },

  writeParameterData: function(buffer, parameter, options) {
    if (parameter.value != null) {
      const time = new Date(+parameter.value);

      let timestamp;
      if (options.useUTC) {
        timestamp = ((time.getUTCHours() * 60 + time.getUTCMinutes()) * 60 + time.getUTCSeconds()) * 1000 + time.getUTCMilliseconds();
      } else {
        timestamp = ((time.getHours() * 60 + time.getMinutes()) * 60 + time.getSeconds()) * 1000 + time.getMilliseconds();
      }

      timestamp = timestamp * Math.pow(10, parameter.scale - 3);
      timestamp += (parameter.value.nanosecondDelta != null ? parameter.value.nanosecondDelta : 0) * Math.pow(10, parameter.scale);
      timestamp = Math.round(timestamp);

      switch (parameter.scale) {
        case 0:
        case 1:
        case 2:
          buffer.writeUInt8(6);
          buffer.writeUInt24LE(timestamp);
          break;
        case 3:
        case 4:
          buffer.writeUInt8(7);
          buffer.writeUInt32LE(timestamp);
          break;
        case 5:
        case 6:
        case 7:
          buffer.writeUInt8(8);
          buffer.writeUInt40LE(timestamp);
      }
      if (options.useUTC) {
        buffer.writeUInt24LE(Math.floor((+parameter.value - UTC_YEAR_ONE) / 86400000));
      } else {
        const dstDiff = -(parameter.value.getTimezoneOffset() - YEAR_ONE.getTimezoneOffset()) * 60 * 1000;
        buffer.writeUInt24LE(Math.floor((+parameter.value - YEAR_ONE + dstDiff) / 86400000));
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (!(value instanceof Date)) {
      value = Date.parse(value);
    }
    if (isNaN(value)) {
      return new TypeError('Invalid date.');
    }
    return value;
  }
};

const DateTimeOffsetN = {
  type: 'DATETIMEOFFSETN',
  name: 'DateTimeOffsetN',
  aliases: ['DateTimeOffset'],
  hasScale: true,
  dataLengthLength: 1,
  dataLengthFromScale: function(scale) {
    switch (scale) {
      case 0:
      case 1:
      case 2:
        return 3;
      case 3:
      case 4:
        return 4;
      case 5:
      case 6:
      case 7:
        return 5;
    }
  },
  declaration: function(parameter) {
    return 'datetimeoffset(' + (this.resolveScale(parameter)) + ')';
  },
  resolveScale: function(parameter) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else if (parameter.value === null) {
      return 0;
    } else {
      return 7;
    }
  },
  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt8(parameter.scale);
  },
  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      const time = new Date(+parameter.value);
      time.setUTCFullYear(1970);
      time.setUTCMonth(0);
      time.setUTCDate(1);

      let timestamp = time * Math.pow(10, parameter.scale - 3);
      timestamp += (parameter.value.nanosecondDelta != null ? parameter.value.nanosecondDelta : 0) * Math.pow(10, parameter.scale);
      timestamp = Math.round(timestamp);

      const offset = -parameter.value.getTimezoneOffset();
      switch (parameter.scale) {
        case 0:
        case 1:
        case 2:
          buffer.writeUInt8(8);
          buffer.writeUInt24LE(timestamp);
          break;
        case 3:
        case 4:
          buffer.writeUInt8(9);
          buffer.writeUInt32LE(timestamp);
          break;
        case 5:
        case 6:
        case 7:
          buffer.writeUInt8(10);
          buffer.writeUInt40LE(timestamp);
      }
      buffer.writeUInt24LE(Math.floor((+parameter.value - UTC_YEAR_ONE) / 86400000));
      buffer.writeInt16LE(offset);
    } else {
      buffer.writeUInt8(0);
    }
  },
  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (!(value instanceof Date)) {
      value = Date.parse(value);
    }
    if (isNaN(value)) {
      return new TypeError('Invalid date.');
    }
    return value;
  }
};

const UDT = {
  type: 'UDTTYPE',
  name: 'UDT',
  hasUDTInfo: true
};

const TVP = {
  type: 'TVPTYPE',
  name: 'TVP',

  declaration: function(parameter) {
    return parameter.value.name + ' readonly';
  },

  writeTypeInfo: function(buffer, parameter) {
    let ref, ref1, ref2, ref3;
    buffer.writeUInt8(this.id);
    buffer.writeBVarchar('');
    buffer.writeBVarchar((ref = (ref1 = parameter.value) != null ? ref1.schema : undefined) != null ? ref : '');
    buffer.writeBVarchar((ref2 = (ref3 = parameter.value) != null ? ref3.name : undefined) != null ? ref2 : '');
  },

  writeParameterData: function(buffer, parameter, options) {
    if (parameter.value == null) {
      buffer.writeUInt16LE(0xFFFF);
      buffer.writeUInt8(0x00);
      buffer.writeUInt8(0x00);
      return;
    }

    buffer.writeUInt16LE(parameter.value.columns.length);

    const ref = parameter.value.columns;
    for (let i = 0, len = ref.length; i < len; i++) {
      const column = ref[i];
      buffer.writeUInt32LE(0x00000000);
      buffer.writeUInt16LE(0x0000);
      column.type.writeTypeInfo(buffer, column);
      buffer.writeBVarchar('');
    }

    buffer.writeUInt8(0x00);

    const ref1 = parameter.value.rows;
    for (let j = 0, len1 = ref1.length; j < len1; j++) {
      const row = ref1[j];

      buffer.writeUInt8(0x01);

      for (let k = 0, len2 = row.length; k < len2; k++) {
        const value = row[k];
        const param = {
          value: value,
          length: parameter.value.columns[k].length,
          scale: parameter.value.columns[k].scale,
          precision: parameter.value.columns[k].precision
        };
        parameter.value.columns[k].type.writeParameterData(buffer, param, options);
      }
    }

    buffer.writeUInt8(0x00);
  },
  validate: function(value) {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'object') {
      return new TypeError('Invalid table.');
    }

    if (!Array.isArray(value.columns)) {
      return new TypeError('Invalid table.');
    }

    if (!Array.isArray(value.rows)) {
      return new TypeError('Invalid table.');
    }

    return value;
  }
};

const Variant = {
  type: 'SSVARIANTTYPE',
  name: 'Variant',
  dataLengthLength: 4,

  declaration: function(parameter) {
    return 'sql_variant';
  }
};

const TYPE = module.exports.TYPE = {
  [0x1F]: Null,
  [0x30]: TinyInt,
  [0x32]: Bit,
  [0x34]: SmallInt,
  [0x38]: Int,
  [0x3A]: SmallDateTime,
  [0x3B]: Real,
  [0x3C]: Money,
  [0x3D]: DateTime,
  [0x3E]: Float,
  [0x37]: Decimal,
  [0x3F]: Numeric,
  [0x7A]: SmallMoney,
  [0x7F]: BigInt,
  [0x22]: Image,
  [0x23]: Text,
  [0x24]: UniqueIdentifierN,
  [0x26]: IntN,
  [0x63]: NText,
  [0x68]: BitN,
  [0x6A]: DecimalN,
  [0x6C]: NumericN,
  [0x6D]: FloatN,
  [0x6E]: MoneyN,
  [0x6F]: DateTimeN,
  [0xA5]: VarBinary,
  [0xA7]: VarChar,
  [0xAD]: Binary,
  [0xAF]: Char,
  [0xE7]: NVarChar,
  [0xEF]: NChar,
  [0xF1]: Xml,
  [0x29]: TimeN,
  [0x28]: DateN,
  [0x2A]: DateTime2N,
  [0x2B]: DateTimeOffsetN,
  [0xF0]: UDT,
  [0xF3]: TVP,
  [0x62]: Variant
};

/*
  CHARTYPE:             0x2F  # Char (legacy support)
  VARCHARTYPE:          0x27  # VarChar (legacy support)
  BINARYTYPE:           0x2D  # Binary (legacy support)
  VARBINARYTYPE:        0x25  # VarBinary (legacy support)

  SSVARIANTTYPE:        0x62  # Sql_Variant (introduced in TDS 7.2)
 */

for (const id in TYPE) {
  const type = TYPE[id];
  type.id = parseInt(id, 10);
  typeByName[type.name] = type;
  if ((type.aliases != null) && type.aliases instanceof Array) {
    const ref = type.aliases;
    const len = ref.length;

    for (let i = 0; i < len; i++) {
      const alias = ref[i];
      if (!typeByName[alias]) {
        typeByName[alias] = type;
      }
    }
  }
}
