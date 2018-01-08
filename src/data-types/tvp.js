module.exports = {
  id: 0xF3,
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
        const column = parameter.value.columns[k];
        const param = row[k];
        column.type.writeParameterData(buffer, param, options);
      }
    }

    buffer.writeUInt8(0x00);
  },

  validate(value) {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== 'object' || !Array.isArray(value.columns) || !Array.isArray(value.rows)) {
      return new TypeError();
    }

    const result = {
      columns: value.columns,
      rows: value.rows.map(function(row) {
        if (!Array.isArray(row)) {
          return new TypeError();
        }

        return row.map(function(columnValue, index) {
          const column = value.columns[index];

          if (column === undefined || column.type === undefined) {
            return new TypeError();
          }

          return {
            value: column.type.validate(columnValue, column.length, column.scale, column.precision),
            length: column.length,
            scale: column.scale,
            precision: column.precision
          };
        });
      })
    };

    return result;
  }
};
