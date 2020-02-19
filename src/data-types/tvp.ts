import { DataType } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const TVP: DataType = {
  id: 0xF3,
  type: 'TVPTYPE',
  name: 'TVP',

  declaration: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.
    return value.name + ' readonly';
  },

  writeTypeInfo: function(buffer, parameter) {
    let ref, ref1, ref2, ref3;
    buffer.writeUInt8(this.id);
    buffer.writeBVarchar('');
    buffer.writeBVarchar((ref = (ref1 = parameter.value) != null ? ref1.schema : undefined) != null ? ref : '');
    buffer.writeBVarchar((ref2 = (ref3 = parameter.value) != null ? ref3.name : undefined) != null ? ref2 : '');
  },

  writeParameterData: function(buffer, parameter, options, cb) {
    const it = this.generate(parameter, options);
    const buffers: Buffer[] = [];
    const next = () => {
      const result = it.next();
      if (result.done) {
        buffer.writeBuffer(Buffer.concat(buffers));
        return cb();
      }
      buffers.push(result.value);
      setImmediate(next);
    };
    next();
  },

  generate: function*(parameter, options) {
    if (parameter.value == null) {
      const buffer = new WritableTrackingBuffer(4);
      buffer.writeUInt16LE(0xFFFF);
      buffer.writeUInt8(0x00);
      buffer.writeUInt8(0x00);
      yield buffer.data;
      return;
    }
    const { columns, rows } = parameter.value;
    let buffer = new WritableTrackingBuffer(200);
    buffer.writeUInt16LE(columns.length);
    for (let i = 0, len = columns.length; i < len; i++) {
      const column = columns[i];
      buffer.writeUInt32LE(0x00000000);
      buffer.writeUInt16LE(0x0000);
      column.type.writeTypeInfo(buffer, column);
      buffer.writeBVarchar('');
    }
    buffer.writeUInt8(0x00);
    for (let i = 0, length = rows.length; i < length; i++) {
      const row = rows[i];
      buffer.writeUInt8(0x01);
      for (let k = 0, len2 = row.length; k < len2; k++) {
        const column = columns[k];
        const value = row[k];
        const param = {
          value: value,
          length: column.length,
          scale: column.scale,
          precision: column.precision
        };
        buffer.writeBuffer(Buffer.concat(Array.from(column.type.generate(param, options))));
      }
      yield buffer.data;
      buffer = new WritableTrackingBuffer(1);
    }
    buffer.writeUInt8(0x00);
    yield buffer.data;
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
