import { DataType } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const TVP: DataType = {
  id: 0xF3,
  type: 'TVPTYPE',
  name: 'TVP',

  declaration: function (parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.
    return value.name + ' readonly';
  },

  writeTypeInfo: function (buffer, parameter) {
    if (buffer) {
      let ref, ref1, ref2, ref3;
      buffer.writeUInt8(this.id);
      buffer.writeBVarchar('');
      buffer.writeBVarchar((ref = (ref1 = parameter.value) != null ? ref1.schema : undefined) != null ? ref : '');
      buffer.writeBVarchar((ref2 = (ref3 = parameter.value) != null ? ref3.name : undefined) != null ? ref2 : '');
      return;
    }

    let ref, ref1, ref2, ref3;
    ref = (ref1 = parameter.value) != null ? ref1.schema : undefined != null ? ref : '';
    ref2 = (ref3 = parameter.value) != null ? ref3.name : undefined != null ? ref2 : '';
    
    const buff = Buffer.from([this.id]);

    const emptyString = '';
    const buff2 = Buffer.from([emptyString.length])
    const buff21 = Buffer.from(emptyString, 'ucs2'); // Encoding might be different?
    const buff22 = Buffer.concat([buff2, buff21], buff2.length + buff21.length);

    const buff3 = Buffer.from([ref.length]);
    const buff31 = Buffer.from(ref, 'ucs2');
    const buff32 = Buffer.concat([buff3, buff31], buff3.length + buff31.length);
    
    const buff4 = Buffer.from([ref2.length]);
    const buff41 = Buffer.from(ref2, 'ucs2');
    const buff42 = Buffer.concat([buff4, buff41], buff4.length + buff41.length);

    return Buffer.concat([buff, buff22, buff32, buff42], buff.length + buff22.length + buff32.length + buff42.length);
  },

  writeParameterData: function (buffer, parameter, options, cb) {
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

  generate: function* (parameter, options) {
    if (parameter.value == null) {
      const buffer = Buffer.alloc(4);
      let offset = 0;
      offset = buffer.writeUInt16LE(0xFFFF, offset);
      offset = buffer.writeUInt8(0x00, offset);
      offset = buffer.writeUInt8(0x00, offset);
      yield buffer;
      return;
    }
    const { columns, rows } = parameter.value;
    let buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(columns.length, 0);
    yield buffer;

    for (let i = 0, len = columns.length; i < len; i++) {
      const column = columns[i];

      const buff = Buffer.alloc(6);
      let offset = buff.writeUInt32LE(0x00000000, 0);
      buff.writeUInt16LE(0x0000, offset);
      yield buff;

      yield column.type.writeTypeInfo(undefined, column);

      const emptyString = '';
      const buff2 = Buffer.from([emptyString.length])
      const buff21 = Buffer.from(emptyString, 'ucs2'); // Encoding might be different?
      yield Buffer.concat([buff2, buff21], buff2.length + buff21.length);
    }
    yield Buffer.from([0x00]);

    for (let i = 0, length = rows.length; i < length; i++) {
      const row = rows[i];
      yield Buffer.from([0x01]);

      for (let k = 0, len2 = row.length; k < len2; k++) {
        const column = columns[k];
        const value = row[k];
        const param = {
          value: value,
          length: column.length,
          scale: column.scale,
          precision: column.precision
        };
        yield Buffer.concat(Array.from(column.type.generate(param, options)));
      }
    }
    yield Buffer.from([0x00])
  },

  validate: function (value): Buffer | null | TypeError {
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
