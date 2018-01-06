// @flow

import type WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';

const guidParser = require('./guid-parser');

const NULL = (1 << 16) - 1;
const EPOCH_DATE = new Date(1900, 0, 1);
const UTC_EPOCH_DATE = new Date(Date.UTC(1900, 0, 1));
const YEAR_ONE = new Date(2000, 0, -730118);
const UTC_YEAR_ONE = Date.UTC(2000, 0, -730118);
const MAX = (1 << 16) - 1;

const typeByName = module.exports.typeByName = {};

const Null = {
  id: 0x1F,
  type: 'NULL',
  name: 'Null'
};

typeByName.Null = Null;

const TinyInt = {
  id: 0x30,
  type: 'INT1',
  name: 'TinyInt',

  declaration: function(parameter: any) {
    return 'tinyint';
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(1);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    // TODO: `undefined` is currently treated like `null` here, but `undefined`
    //       and `null` have different semantics. `undefined` should not be a
    //       valid argument type.
    if (value != null) {
      buffer.writeUInt8(1);
      if (typeof value === 'number') {
        buffer.writeUInt8(value);
      } else {
        buffer.writeUInt8(parseInt(value));
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.TinyInt = TinyInt;

const Bit = {
  id: 0x32,
  type: 'BIT',
  name: 'Bit',

  declaration: function(parameter: any) {
    return 'bit';
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(BitN.id);
    buffer.writeUInt8(1);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    // TODO: `undefined` is currently treated like `null` here, but `undefined`
    //       and `null` have different semantics. `undefined` should not be a
    //       valid argument type.
    if (parameter.value === undefined || parameter.value === null) {
      buffer.writeUInt8(0);
    } else {
      buffer.writeUInt8(1);
      buffer.writeUInt8(parameter.value ? 1 : 0);
    }
  },

  validate: function(value: any) {
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

typeByName.Bit = Bit;

const SmallInt = {
  id: 0x34,
  type: 'INT2',
  name: 'SmallInt',

  declaration: function(parameter: any) {
    return 'smallint';
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(2);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;
    if (value != null) {
      buffer.writeUInt8(2);

      if (typeof value === 'number') {
        buffer.writeInt16LE(value);
      } else {
        buffer.writeInt16LE(parseInt(value));
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.SmallInt = SmallInt;

const Int = {
  id: 0x38,
  type: 'INT4',
  name: 'Int',

  declaration: function(parameter: any) {
    return 'int';
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;
    if (value != null) {
      buffer.writeUInt8(4);

      if (typeof value === 'number') {
        buffer.writeInt32LE(value);
      } else {
        buffer.writeInt32LE(parseInt(value));
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.Int = Int;

const SmallDateTime = {
  id: 0x3A,
  type: 'DATETIM4',
  name: 'SmallDateTime',

  declaration: function(parameter: any) {
    return 'smalldatetime';
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(DateTimeN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && !(value instanceof Date)) {
      throw new TypeError(`The "parameter.value" property must be one of type Date, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      let days, dstDiff, minutes;
      if (options.useUTC) {
        days = Math.floor((value.getTime() - UTC_EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
        minutes = (value.getUTCHours() * 60) + value.getUTCMinutes();
      } else {
        dstDiff = -(value.getTimezoneOffset() - EPOCH_DATE.getTimezoneOffset()) * 60 * 1000;
        days = Math.floor((value.getTime() - EPOCH_DATE.getTime() + dstDiff) / (1000 * 60 * 60 * 24));
        minutes = (value.getHours() * 60) + value.getMinutes();
      }

      buffer.writeUInt8(4);
      buffer.writeUInt16LE(days);

      buffer.writeUInt16LE(minutes);
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.SmallDateTime = SmallDateTime;

const Real = {
  id: 0x3B,
  type: 'FLT4',
  name: 'Real',

  declaration: function(parameter: any) {
    return 'real';
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(FloatN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null) {
      buffer.writeUInt8(4);

      if (typeof value === 'number') {
        buffer.writeFloatLE(value);
      } else {
        buffer.writeFloatLE(parseFloat(value));
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.Real = Real;

const Money = {
  id: 0x3C,
  type: 'MONEY',
  name: 'Money',

  declaration: function(parameter: any) {
    return 'money';
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(MoneyN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && !(typeof value === 'number')) {
      throw new TypeError(`The "parameter.value" property must be one of type number, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      buffer.writeUInt8(8);
      buffer.writeMoney(value * 10000);
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.Money = Money;

const DateTime = {
  id: 0x3D,
  type: 'DATETIME',
  name: 'DateTime',

  declaration: function(parameter: any) {
    return 'datetime';
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(DateTimeN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && !(value instanceof Date)) {
      throw new TypeError(`The "parameter.value" property must be one of type Date, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      let days, dstDiff, milliseconds, seconds, threeHundredthsOfSecond;
      if (options.useUTC) {
        days = Math.floor((value.getTime() - UTC_EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
        seconds = value.getUTCHours() * 60 * 60;
        seconds += value.getUTCMinutes() * 60;
        seconds += value.getUTCSeconds();
        milliseconds = (seconds * 1000) + value.getUTCMilliseconds();
      } else {
        dstDiff = -(value.getTimezoneOffset() - EPOCH_DATE.getTimezoneOffset()) * 60 * 1000;
        days = Math.floor((value.getTime() - EPOCH_DATE.getTime() + dstDiff) / (1000 * 60 * 60 * 24));
        seconds = value.getHours() * 60 * 60;
        seconds += value.getMinutes() * 60;
        seconds += value.getSeconds();
        milliseconds = (seconds * 1000) + value.getMilliseconds();
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

  validate: function(value: any) {
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

typeByName.DateTime = DateTime;

const Float = {
  id: 0x3E,
  type: 'FLT8',
  name: 'Float',

  declaration: function(parameter: any) {
    return 'float';
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(FloatN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (parameter.value != null) {
      buffer.writeUInt8(8);

      if (typeof value === 'number') {
        buffer.writeDoubleLE(value);
      } else {
        buffer.writeDoubleLE(parseFloat(value));
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.Float = Float;

const Decimal = {
  id: 0x37,
  type: 'DECIMAL',
  name: 'Decimal',
  hasPrecision: true,
  hasScale: true,

  declaration: function(parameter: any) {
    return 'decimal(' + (this.resolvePrecision(parameter)) + ', ' + (this.resolveScale(parameter)) + ')';
  },

  resolvePrecision: function(parameter: any) {
    if (parameter.precision != null) {
      return parameter.precision;
    } else if (parameter.value === null) {
      return 1;
    } else {
      return 18;
    }
  },

  resolveScale: function(parameter: any) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else {
      return 0;
    }
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(DecimalN.id);
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

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && typeof value !== 'number') {
      throw new TypeError(`The "parameter.value" property must be one of type number, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      const sign = value < 0 ? 0 : 1;
      const decimalValue = Math.round(Math.abs(value * Math.pow(10, parameter.scale)));
      if (parameter.precision <= 9) {
        buffer.writeUInt8(5);
        buffer.writeUInt8(sign);
        buffer.writeUInt32LE(decimalValue);
      } else if (parameter.precision <= 19) {
        buffer.writeUInt8(9);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(decimalValue);
      } else if (parameter.precision <= 28) {
        buffer.writeUInt8(13);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(decimalValue);
        buffer.writeUInt32LE(0x00000000);
      } else {
        buffer.writeUInt8(17);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(decimalValue);
        buffer.writeUInt32LE(0x00000000);
        buffer.writeUInt32LE(0x00000000);
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.Decimal = Decimal;

const Numeric = {
  id: 0x3F,
  type: 'NUMERIC',
  name: 'Numeric',
  hasPrecision: true,
  hasScale: true,

  declaration: function(parameter: any) {
    return 'numeric(' + (this.resolvePrecision(parameter)) + ', ' + (this.resolveScale(parameter)) + ')';
  },

  resolvePrecision: function(parameter: any) {
    if (parameter.precision != null) {
      return parameter.precision;
    } else if (parameter.value === null) {
      return 1;
    } else {
      return 18;
    }
  },

  resolveScale: function(parameter: any) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else {
      return 0;
    }
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(NumericN.id);
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

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && typeof value !== 'number') {
      throw new TypeError(`The "parameter.value" property must be one of type number, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      const sign = value < 0 ? 0 : 1;
      const numericValue = Math.round(Math.abs(value * Math.pow(10, parameter.scale)));
      if (parameter.precision <= 9) {
        buffer.writeUInt8(5);
        buffer.writeUInt8(sign);
        buffer.writeUInt32LE(numericValue);
      } else if (parameter.precision <= 19) {
        buffer.writeUInt8(9);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(numericValue);
      } else if (parameter.precision <= 28) {
        buffer.writeUInt8(13);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(numericValue);
        buffer.writeUInt32LE(0x00000000);
      } else {
        buffer.writeUInt8(17);
        buffer.writeUInt8(sign);
        buffer.writeUInt64LE(numericValue);
        buffer.writeUInt32LE(0x00000000);
        buffer.writeUInt32LE(0x00000000);
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.Numeric = Numeric;

const SmallMoney = {
  id: 0x7A,
  type: 'MONEY4',
  name: 'SmallMoney',

  declaration: function(parameter: any) {
    return 'smallmoney';
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(MoneyN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && typeof value !== 'number') {
      throw new TypeError(`The "parameter.value" property must be one of type number, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      buffer.writeUInt8(4);
      buffer.writeInt32LE(value * 10000);
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.SmallMoney = SmallMoney;

const BigInt = {
  id: 0x7F,
  type: 'INT8',
  name: 'BigInt',

  declaration: function(parameter: any) {
    return 'bigint';
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null) {
      buffer.writeUInt8(8);
      if (typeof value === 'number') {
        buffer.writeInt64LE(value);
      } else {
        buffer.writeInt64LE(parseInt(value));
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.BigInt = BigInt;

const Image = {
  id: 0x22,
  type: 'IMAGE',
  name: 'Image',
  hasTableName: true,
  hasTextPointerAndTimestamp: true,
  dataLengthLength: 4,

  declaration: function(parameter: any) {
    return 'image';
  },

  resolveLength: function(parameter: any) {
    if (parameter.value != null) {
      return parameter.value.length;
    } else {
      return -1;
    }
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(this.id);
    buffer.writeInt32LE(parameter.length);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && !(value instanceof Buffer)) {
      throw new TypeError(`The "parameter.value" property must be one of type Buffer, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      buffer.writeInt32LE(parameter.length);
      buffer.writeBuffer(value);
    } else {
      buffer.writeInt32LE(parameter.length);
    }
  },

  validate: function(value: any) {
    if (value == null) {
      return null;
    }
    if (!Buffer.isBuffer(value)) {
      return new TypeError('Invalid buffer.');
    }
    return value;
  }
};

typeByName.Image = Image;

const Text = {
  id: 0x23,
  type: 'TEXT',
  name: 'Text',
  hasCollation: true,
  hasTableName: true,
  hasTextPointerAndTimestamp: true,
  dataLengthLength: 4,

  declaration: function(parameter: any) {
    return 'text';
  },

  resolveLength: function(parameter: any) {
    if (parameter.value != null) {
      return parameter.value.length;
    } else {
      return -1;
    }
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(Text.id);
    buffer.writeInt32LE(parameter.length);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && !(value instanceof Buffer) && typeof value !== 'string') {
      throw new TypeError(`The "parameter.value" property must be one of type Buffer, undefined or null. Received type ${typeof value}`);
    }

    buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]));

    if (value != null) {
      buffer.writeInt32LE(parameter.length);
      buffer.writeString(value.toString(), 'ascii');
    } else {
      buffer.writeInt32LE(parameter.length);
    }
  },

  validate: function(value: any) {
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

typeByName.Text = Text;

const UniqueIdentifierN = {
  id: 0x24,
  type: 'GUIDN',
  name: 'UniqueIdentifierN',
  aliases: ['UniqueIdentifier'],
  dataLengthLength: 1,

  declaration: function(parameter: any) {
    return 'uniqueidentifier';
  },

  resolveLength: function() {
    return 16;
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(UniqueIdentifierN.id);
    buffer.writeUInt8(0x10);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && typeof value !== 'string') {
      throw new TypeError(`The "parameter.value" property must be one of type string, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      buffer.writeUInt8(0x10);
      buffer.writeBuffer(new Buffer(guidParser.guidToArray(value)));
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.UniqueIdentifierN = typeByName.UniqueIdentifier = UniqueIdentifierN;

const IntN = {
  id: 0x26,
  type: 'INTN',
  name: 'IntN',
  dataLengthLength: 1
};

typeByName.IntN = IntN;

const NText = {
  id: 0x63,
  type: 'NTEXT',
  name: 'NText',
  hasCollation: true,
  hasTableName: true,
  hasTextPointerAndTimestamp: true,
  dataLengthLength: 4
};

typeByName.NText = NText;

const BitN = {
  id: 0x68,
  type: 'BITN',
  name: 'BitN',
  dataLengthLength: 1
};

typeByName.BitN = BitN;

const DecimalN = {
  id: 0x6A,
  type: 'DECIMALN',
  name: 'DecimalN',
  dataLengthLength: 1,
  hasPrecision: true,
  hasScale: true
};

typeByName.DecimalN = DecimalN;

const NumericN = {
  id: 0x6C,
  type: 'NUMERICN',
  name: 'NumericN',
  dataLengthLength: 1,
  hasPrecision: true,
  hasScale: true
};

typeByName.NumericN = NumericN;

const FloatN = {
  id: 0x6D,
  type: 'FLTN',
  name: 'FloatN',
  dataLengthLength: 1
};

typeByName.FloatN = FloatN;

const MoneyN = {
  id: 0x6E,
  type: 'MONEYN',
  name: 'MoneyN',
  dataLengthLength: 1
};

typeByName.MoneyN = MoneyN;

const DateTimeN = {
  id: 0x6F,
  type: 'DATETIMN',
  name: 'DateTimeN',
  dataLengthLength: 1
};

typeByName.DateTimeN = DateTimeN;

const VarBinary = {
  id: 0xA5,
  type: 'BIGVARBIN',
  name: 'VarBinary',
  dataLengthLength: 2,
  maximumLength: 8000,

  declaration: function(parameter: any) {
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

  resolveLength: function(parameter: any) {
    if (parameter.length != null) {
      return parameter.length;
    } else if (parameter.value != null) {
      return parameter.value.length;
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(this.id);
    if (parameter.length <= this.maximumLength) {
      buffer.writeUInt16LE(this.maximumLength);
    } else {
      buffer.writeUInt16LE(MAX);
    }
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && typeof value !== 'string' && !(value instanceof Buffer)) {
      throw new TypeError(`The "parameter.value" property must be one of type Buffer, string, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      if (parameter.length <= this.maximumLength) {
        buffer.writeUsVarbyte(value);
      } else {
        buffer.writePLPBody(value);
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

  validate: function(value: any) {
    if (value == null) {
      return null;
    }
    if (!Buffer.isBuffer(value)) {
      return new TypeError('Invalid buffer.');
    }
    return value;
  }
};

typeByName.VarBinary = VarBinary;

const VarChar = {
  id: 0xA7,
  type: 'BIGVARCHR',
  name: 'VarChar',
  hasCollation: true,
  dataLengthLength: 2,
  maximumLength: 8000,

  declaration: function(parameter: any) {
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

  resolveLength: function(parameter: any) {
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

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(this.id);
    if (parameter.length <= this.maximumLength) {
      buffer.writeUInt16LE(this.maximumLength);
    } else {
      buffer.writeUInt16LE(MAX);
    }
    buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]));
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && typeof value !== 'string' && !(value instanceof Buffer)) {
      throw new TypeError(`The "parameter.value" property must be one of type Buffer, string, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      if (parameter.length <= this.maximumLength) {
        buffer.writeUsVarbyte(value, 'ascii');
      } else {
        buffer.writePLPBody(value, 'ascii');
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

  validate: function(value: any) {
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

typeByName.VarChar = VarChar;

const Binary = {
  id: 0xAD,
  type: 'BIGBinary',
  name: 'Binary',
  dataLengthLength: 2,
  maximumLength: 8000,

  declaration: function(parameter: any) {
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

  resolveLength: function(parameter: any) {
    if (parameter.value != null) {
      return parameter.value.length;
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt16LE(parameter.length);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && typeof value !== 'string' && !(value instanceof Buffer)) {
      throw new TypeError(`The "parameter.value" property must be one of type Buffer, string, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      buffer.writeUInt16LE(parameter.length);
      buffer.writeBuffer(value.slice(0, Math.min(parameter.length, this.maximumLength)));
    } else {
      buffer.writeUInt16LE(NULL);
    }
  },

  validate: function(value: any) {
    if (value == null) {
      return null;
    }
    if (!Buffer.isBuffer(value)) {
      return new TypeError('Invalid buffer.');
    }
    return value;
  }
};

typeByName.Binary = Binary;

const Char = {
  id: 0xAF,
  type: 'BIGCHAR',
  name: 'Char',
  hasCollation: true,
  dataLengthLength: 2,
  maximumLength: 8000,

  declaration: function(parameter: any) {
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

  resolveLength: function(parameter: any) {
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

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt16LE(parameter.length);
    buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]));
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && typeof value !== 'string' && !(value instanceof Buffer)) {
      throw new TypeError(`The "parameter.value" property must be one of type Buffer, string, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      buffer.writeUsVarbyte(value, 'ascii');
    } else {
      buffer.writeUInt16LE(NULL);
    }
  },

  validate: function(value: any) {
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

typeByName.Char = Char;

const NVarChar = {
  id: 0xE7,
  type: 'NVARCHAR',
  name: 'NVarChar',
  hasCollation: true,
  dataLengthLength: 2,
  maximumLength: 4000,

  declaration: function(parameter: any) {
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

  resolveLength: function(parameter: any) {
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

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(this.id);
    if (parameter.length <= this.maximumLength) {
      buffer.writeUInt16LE(parameter.length * 2);
    } else {
      buffer.writeUInt16LE(MAX);
    }
    buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]));
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && typeof value !== 'string' && !(value instanceof Buffer)) {
      throw new TypeError(`The "parameter.value" property must be one of type Buffer, string, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      if (parameter.length <= this.maximumLength) {
        buffer.writeUsVarbyte(value, 'ucs2');
      } else {
        buffer.writePLPBody(value, 'ucs2');
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

  validate: function(value: any) {
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

typeByName.NVarChar = NVarChar;

const NChar = {
  id: 0xEF,
  type: 'NCHAR',
  name: 'NChar',
  hasCollation: true,
  dataLengthLength: 2,
  maximumLength: 4000,

  declaration: function(parameter: any) {
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

  resolveLength: function(parameter: any) {
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

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt16LE(parameter.length * 2);
    buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]));
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && typeof value !== 'string' && !(value instanceof Buffer)) {
      throw new TypeError(`The "parameter.value" property must be one of type Buffer, string, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      buffer.writeUsVarbyte(value, 'ucs2');
    } else {
      buffer.writeUInt16LE(NULL);
    }
  },

  validate: function(value: any) {
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

typeByName.NChar = NChar;

const Xml = {
  id: 0xF1,
  type: 'XML',
  name: 'Xml',
  hasSchemaPresent: true
};

typeByName.Xml = Xml;

const TimeN = {
  id: 0x29,
  type: 'TIMEN',
  name: 'TimeN',
  aliases: ['Time'],
  hasScale: true,
  dataLengthLength: 1,

  dataLengthFromScale: function(scale: number) {
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

  declaration: function(parameter: any) {
    return 'time(' + (this.resolveScale(parameter)) + ')';
  },

  resolveScale: function(parameter: any) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else if (parameter.value === null) {
      return 0;
    } else {
      return 7;
    }
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt8(parameter.scale);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
      throw new TypeError(`The "parameter.value" property must be one of type Date, number, string, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      const time = value instanceof Date ? value : new Date(+value);

      let timestamp;
      if (options.useUTC) {
        timestamp = ((time.getUTCHours() * 60 + time.getUTCMinutes()) * 60 + time.getUTCSeconds()) * 1000 + time.getUTCMilliseconds();
      } else {
        timestamp = ((time.getHours() * 60 + time.getMinutes()) * 60 + time.getSeconds()) * 1000 + time.getMilliseconds();
      }

      timestamp = timestamp * Math.pow(10, parameter.scale - 3);
      timestamp += (value.nanosecondDelta != null ? value.nanosecondDelta : 0) * Math.pow(10, parameter.scale);
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

  validate: function(value: any) {
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

typeByName.TimeN = typeByName.Time = TimeN;

const DateN = {
  id: 0x28,
  type: 'DATEN',
  name: 'DateN',
  aliases: ['Date'],
  dataLengthLength: 1,
  fixedDataLength: 3,

  declaration: function(parameter: any) {
    return 'date';
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(this.id);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && !(value instanceof Date)) {
      throw new TypeError(`The "parameter.value" property must be one of type Date, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      buffer.writeUInt8(3);
      if (options.useUTC) {
        buffer.writeUInt24LE(Math.floor((+value - UTC_YEAR_ONE) / 86400000));
      } else {
        const dstDiff = -(value.getTimezoneOffset() - YEAR_ONE.getTimezoneOffset()) * 60 * 1000;
        buffer.writeUInt24LE(Math.floor((+value - YEAR_ONE + dstDiff) / 86400000));
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.DateN = typeByName.Date = DateN;

const DateTime2N = {
  id: 0x2A,
  type: 'DATETIME2N',
  name: 'DateTime2N',
  aliases: ['DateTime2'],
  hasScale: true,
  dataLengthLength: 1,

  dataLengthFromScale: function(scale: number) {
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

  declaration: function(parameter: any) {
    return 'datetime2(' + (this.resolveScale(parameter)) + ')';
  },

  resolveScale: function(parameter: any) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else if (parameter.value === null) {
      return 0;
    } else {
      return 7;
    }
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt8(parameter.scale);
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
      throw new TypeError(`The "parameter.value" property must be one of type Date, number, string, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      const time = value instanceof Date ? value : new Date(+value);

      let timestamp;
      if (options.useUTC) {
        timestamp = ((time.getUTCHours() * 60 + time.getUTCMinutes()) * 60 + time.getUTCSeconds()) * 1000 + time.getUTCMilliseconds();
      } else {
        timestamp = ((time.getHours() * 60 + time.getMinutes()) * 60 + time.getSeconds()) * 1000 + time.getMilliseconds();
      }

      timestamp = timestamp * Math.pow(10, parameter.scale - 3);
      timestamp += (value.nanosecondDelta != null ? value.nanosecondDelta : 0) * Math.pow(10, parameter.scale);
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
        buffer.writeUInt24LE(Math.floor((+value - UTC_YEAR_ONE) / 86400000));
      } else {
        const dstDiff = -(value.getTimezoneOffset() - YEAR_ONE.getTimezoneOffset()) * 60 * 1000;
        buffer.writeUInt24LE(Math.floor((+value - YEAR_ONE + dstDiff) / 86400000));
      }
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value: any) {
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

typeByName.DateTime2N = typeByName.DateTime2 = DateTime2N;

const DateTimeOffsetN = {
  id: 0x2B,
  type: 'DATETIMEOFFSETN',
  name: 'DateTimeOffsetN',
  aliases: ['DateTimeOffset'],
  hasScale: true,
  dataLengthLength: 1,
  dataLengthFromScale: function(scale: number) {
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
  declaration: function(parameter: any) {
    return 'datetimeoffset(' + (this.resolveScale(parameter)) + ')';
  },
  resolveScale: function(parameter: any) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else if (parameter.value === null) {
      return 0;
    } else {
      return 7;
    }
  },
  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt8(parameter.scale);
  },
  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value != null && typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
      throw new TypeError(`The "parameter.value" property must be one of type Date, number, string, undefined or null. Received type ${typeof value}`);
    }

    if (value != null) {
      const time = value instanceof Date ? value : new Date(+value);

      time.setUTCFullYear(1970);
      time.setUTCMonth(0);
      time.setUTCDate(1);

      let timestamp = time * Math.pow(10, parameter.scale - 3);
      timestamp += (value.nanosecondDelta != null ? value.nanosecondDelta : 0) * Math.pow(10, parameter.scale);
      timestamp = Math.round(timestamp);

      const offset = -value.getTimezoneOffset();
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
      buffer.writeUInt24LE(Math.floor((+value - UTC_YEAR_ONE) / 86400000));
      buffer.writeInt16LE(offset);
    } else {
      buffer.writeUInt8(0);
    }
  },
  validate: function(value: any) {
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

typeByName.DateTimeOffsetN = typeByName.DateTimeOffset = DateTimeOffsetN;

const UDT = {
  id: 0xF0,
  type: 'UDTTYPE',
  name: 'UDT',
  hasUDTInfo: true
};

typeByName.UDT = UDT;

const TVP = {
  id: 0xF3,
  type: 'TVPTYPE',
  name: 'TVP',

  declaration: function(parameter: any) {
    return parameter.value.name + ' readonly';
  },

  writeTypeInfo: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    buffer.writeUInt8(this.id);
    buffer.writeBVarchar('');
    buffer.writeBVarchar(parameter.value != null && parameter.value.schema != null ? parameter.value.schema : '');
    buffer.writeBVarchar(parameter.value != null && parameter.value.name != null ? parameter.value.name : '');
  },

  writeParameterData: function(buffer: WritableTrackingBuffer, parameter: any, options: any) {
    const value = parameter.value;

    if (value == null) {
      buffer.writeUInt16LE(0xFFFF);
      buffer.writeUInt8(0x00);
      buffer.writeUInt8(0x00);
      return;
    }

    buffer.writeUInt16LE(value.columns.length);

    const ref = value.columns;
    for (let i = 0, len = ref.length; i < len; i++) {
      const column = ref[i];
      buffer.writeUInt32LE(0x00000000);
      buffer.writeUInt16LE(0x0000);
      column.type.writeTypeInfo(buffer, column);
      buffer.writeBVarchar('');
    }

    buffer.writeUInt8(0x00);

    const ref1 = value.rows;
    for (let j = 0, len1 = ref1.length; j < len1; j++) {
      const row = ref1[j];

      buffer.writeUInt8(0x01);

      for (let k = 0, len2 = row.length; k < len2; k++) {
        const rowValue = row[k];
        const column = value.columns[k];

        const param = {
          value: rowValue,
          length: column.length,
          scale: column.scale,
          precision: column.precision
        };
        column.type.writeParameterData(buffer, param, options);
      }
    }

    buffer.writeUInt8(0x00);
  },

  validate: function(value: any) {
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

typeByName.TVP = TVP;

const Variant = {
  id: 0x62,
  type: 'SSVARIANTTYPE',
  name: 'Variant',
  dataLengthLength: 4,

  declaration: function(parameter: any) {
    return 'sql_variant';
  }
};

typeByName.Variant = Variant;

module.exports.TYPE = {
  [Null.id]: Null,
  [TinyInt.id]: TinyInt,
  [Bit.id]: Bit,
  [SmallInt.id]: SmallInt,
  [Int.id]: Int,
  [SmallDateTime.id]: SmallDateTime,
  [Real.id]: Real,
  [Money.id]: Money,
  [DateTime.id]: DateTime,
  [Float.id]: Float,
  [Decimal.id]: Decimal,
  [Numeric.id]: Numeric,
  [SmallMoney.id]: SmallMoney,
  [BigInt.id]: BigInt,
  [Image.id]: Image,
  [Text.id]: Text,
  [UniqueIdentifierN.id]: UniqueIdentifierN,
  [IntN.id]: IntN,
  [NText.id]: NText,
  [BitN.id]: BitN,
  [DecimalN.id]: DecimalN,
  [NumericN.id]: NumericN,
  [FloatN.id]: FloatN,
  [MoneyN.id]: MoneyN,
  [DateTimeN.id]: DateTimeN,
  [VarBinary.id]: VarBinary,
  [VarChar.id]: VarChar,
  [Binary.id]: Binary,
  [Char.id]: Char,
  [NVarChar.id]: NVarChar,
  [NChar.id]: NChar,
  [Xml.id]: Xml,
  [TimeN.id]: TimeN,
  [DateN.id]: DateN,
  [DateTime2N.id]: DateTime2N,
  [DateTimeOffsetN.id]: DateTimeOffsetN,
  [UDT.id]: UDT,
  [TVP.id]: TVP,
  [Variant.id]: Variant
};

export type DataType =
  typeof Null | typeof TinyInt | typeof Bit | typeof SmallInt | typeof Int |
  typeof SmallDateTime | typeof Real | typeof Money | typeof DateTime |
  typeof Float | typeof Decimal | typeof Numeric | typeof SmallMoney |
  typeof BigInt | typeof Image | typeof Text | typeof UniqueIdentifierN |
  typeof IntN | typeof NText | typeof BitN | typeof DecimalN | typeof NumericN |
  typeof FloatN | typeof MoneyN | typeof DateTimeN | typeof VarBinary |
  typeof VarChar | typeof Binary | typeof Char | typeof NVarChar |
  typeof NChar | typeof Xml | typeof TimeN | typeof DateN | typeof DateTime2N |
  typeof DateTimeOffsetN | typeof UDT | typeof TVP | typeof Variant;

/*
  CHARTYPE:             0x2F  # Char (legacy support)
  VARCHARTYPE:          0x27  # VarChar (legacy support)
  BINARYTYPE:           0x2D  # Binary (legacy support)
  VARBINARYTYPE:        0x25  # VarBinary (legacy support)

  SSVARIANTTYPE:        0x62  # Sql_Variant (introduced in TDS 7.2)
 */
