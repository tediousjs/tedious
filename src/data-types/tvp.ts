import { DataType } from '../data-type';

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
    const writeNext = (i:number) => {
      if (i >= ref1.length) {
        buffer.writeUInt8(0x00);
        cb();
        return;
      }
      const row = ref1[i];

      buffer.writeUInt8(0x01);

      for (let k = 0, len2 = row.length; k < len2; k++) {
        const value = row[k];
        const param = {
          value: value,
          length: parameter.value.columns[k].length,
          scale: parameter.value.columns[k].scale,
          precision: parameter.value.columns[k].precision
        };
        parameter.value.columns[k].type.writeParameterData(buffer, param, options, () => {});
      }

      setImmediate(() => {
        writeNext(i + 1);
      });
    };

    writeNext(0);
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
