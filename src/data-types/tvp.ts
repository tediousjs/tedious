import { DataType } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const TVP_ROW_TOKEN = Buffer.from([0x01]);
const TVP_END_TOKEN = Buffer.from([0x00]);

const TVP: DataType = {
  id: 0xF3,
  type: 'TVPTYPE',
  name: 'TVP',

  declaration: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.
    return value.name + ' readonly';
  },

  generateTypeInfo(parameter) {
    const databaseName = '';
    const schema = parameter.value?.schema ?? '';
    const typeName = parameter.value?.name ?? '';

    const bufferLength = 1 +
      1 + Buffer.byteLength(databaseName, 'ucs2') +
      1 + Buffer.byteLength(schema, 'ucs2') +
      1 + Buffer.byteLength(typeName, 'ucs2');

    const buffer = new WritableTrackingBuffer(bufferLength, 'ucs2');
    buffer.writeUInt8(this.id);
    buffer.writeBVarchar(databaseName);
    buffer.writeBVarchar(schema);
    buffer.writeBVarchar(typeName);

    return buffer.data;
  },

  *generateParameterData(parameter, options) {
    if (parameter.value == null) {
      const buffer = Buffer.alloc(4);
      buffer.writeUInt16LE(0xFFFF, 0);
      buffer.writeUInt8(0x00, 2);
      buffer.writeUInt8(0x00, 3);
      yield buffer;
      return;
    }

    const { columns, rows } = parameter.value;
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(columns.length, 0);
    yield buffer;

    for (let i = 0, len = columns.length; i < len; i++) {
      const column = columns[i];

      const buff = Buffer.alloc(6);
      // UserType
      buff.writeUInt32LE(0x00000000, 0);

      // Flags
      buff.writeUInt16LE(0x0000, 4);
      yield buff;

      // TYPE_INFO
      yield column.type.generateTypeInfo(column);

      // ColName
      yield Buffer.from([0x00]);
    }

    yield TVP_END_TOKEN;

    for (let i = 0, length = rows.length; i < length; i++) {
      yield TVP_ROW_TOKEN;

      const row = rows[i];
      for (let k = 0, len2 = row.length; k < len2; k++) {
        const column = columns[k];
        const value = row[k];

        const param = {
          value: value,
          length: column.length,
          scale: column.scale,
          precision: column.precision
        };

        // TvpColumnData
        yield * column.type.generateParameterData(param, options);
      }
    }

    yield TVP_END_TOKEN;
  },

  validate: function(value): Buffer | null | TypeError {
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

export default TVP;
module.exports = TVP;
