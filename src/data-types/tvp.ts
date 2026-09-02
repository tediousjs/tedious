import { type DataType, type ParameterData, writeTypeInfo, writeValue } from '../data-type';
import { type InternalConnectionOptions } from '../connection';
import { type Collation } from '../collation';
import { InputError } from '../errors';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';
import { isAsyncIterable } from './plp-stream';

const TVP_ROW_TOKEN = Buffer.from([0x01]);
const TVP_END_TOKEN = Buffer.from([0x00]);

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);

// A NULL table: no columns, and the end tokens of the column metadata and
// of the rows.
const NULL_TABLE = Buffer.from([0xFF, 0xFF, 0x00, 0x00]);

// Row data is accumulated up to this size before being handed out, so the
// number of yields is proportional to the byte size, not the row count.
const FLUSH_SIZE = WritableTrackingBuffer.CHUNK_SIZE;

interface TvpColumn {
  name: string;
  type: DataType;
  length?: number | undefined;
  precision?: number | undefined;
  scale?: number | undefined;
}

type TvpRow = unknown[];

interface TvpValue {
  name?: string | undefined;
  schema?: string | undefined;
  columns: TvpColumn[];
  // Rows are validated as they are written, whether they are given as an
  // array or as an async iterable that is read while the request is written.
  rows: TvpRow[] | AsyncIterable<TvpRow>;
}

function validateRow(columns: TvpColumn[], row: TvpRow, rowIndex: number, collation: Collation | undefined): TvpRow {
  if (!Array.isArray(row)) {
    throw new InputError(`TVP row at index ${rowIndex} is not an array`);
  }

  const validated = new Array(row.length);
  for (let k = 0, len = row.length; k < len; k++) {
    const column = columns[k];

    try {
      validated[k] = column.type.validate(row[k], collation);
    } catch (error) {
      throw new InputError(`TVP column '${column.name}' has invalid data at row index ${rowIndex}`, { cause: error });
    }
  }

  return validated;
}

function writeColumnMetadata(buffer: WritableTrackingBuffer, value: TvpValue, options: InternalConnectionOptions) {
  const { columns } = value;

  buffer.writeUInt16LE(columns.length);

  for (let i = 0, len = columns.length; i < len; i++) {
    const column = columns[i];

    // UserType
    buffer.writeUInt32LE(0x00000000);
    // Flags
    buffer.writeUInt16LE(0x0000);
    // TYPE_INFO
    writeTypeInfo(column.type, buffer, { value: undefined, length: column.length, precision: column.precision, scale: column.scale }, options);
    // ColName
    buffer.writeUInt8(0x00);
  }

  buffer.writeBuffer(TVP_END_TOKEN);
}

function writeRow(buffer: WritableTrackingBuffer, columns: TvpColumn[], row: TvpRow, options: InternalConnectionOptions) {
  buffer.writeBuffer(TVP_ROW_TOKEN);

  for (let k = 0, len = row.length; k < len; k++) {
    const column = columns[k];
    const cell: ParameterData = { value: row[k], length: column.length, scale: column.scale, precision: column.precision };

    // TvpColumnData
    writeValue(column.type, buffer, cell, options);
  }
}

function * writeRows(value: TvpValue, rows: TvpRow[], collation: Collation | undefined, options: InternalConnectionOptions): Generator<Buffer, void> {
  const buffer = new WritableTrackingBuffer();
  writeColumnMetadata(buffer, value, options);

  for (let i = 0, len = rows.length; i < len; i++) {
    writeRow(buffer, value.columns, validateRow(value.columns, rows[i], i, collation), options);

    if (buffer.length >= FLUSH_SIZE) {
      yield * buffer.getBuffers();
      buffer.consume(buffer.length);
    }
  }

  buffer.writeBuffer(TVP_END_TOKEN);
  yield * buffer.getBuffers();
}

async function * writeRowsFrom(value: TvpValue, rows: AsyncIterable<TvpRow>, collation: Collation | undefined, options: InternalConnectionOptions): AsyncGenerator<Buffer, void> {
  const buffer = new WritableTrackingBuffer();
  writeColumnMetadata(buffer, value, options);

  let rowIndex = 0;
  for await (const row of rows) {
    writeRow(buffer, value.columns, validateRow(value.columns, row, rowIndex++, collation), options);

    if (buffer.length >= FLUSH_SIZE) {
      yield * buffer.getBuffers();
      buffer.consume(buffer.length);
    }
  }

  buffer.writeBuffer(TVP_END_TOKEN);
  yield * buffer.getBuffers();
}

const TVP: DataType = {
  id: 0xF3,
  type: 'TVPTYPE',
  name: 'TVP',

  declaration: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.
    const schema = value.schema ? value.schema + '.' : '';
    return schema + value.name + ' readonly';
  },

  generateTypeInfo(parameter) {
    const databaseName = '';
    const schema = parameter.value?.schema ?? '';
    const typeName = parameter.value?.name ?? '';

    const buffer = new WritableTrackingBuffer();
    buffer.writeUInt8(this.id);
    buffer.writeBVarchar(databaseName, 'ucs2');
    buffer.writeBVarchar(schema, 'ucs2');
    buffer.writeBVarchar(typeName, 'ucs2');

    return buffer.data;
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    const { columns } = parameter.value;
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(columns.length, 0);
    return buffer;
  },

  *generateParameterData(parameter, options) {
    if (parameter.value == null) {
      yield TVP_END_TOKEN;
      yield TVP_END_TOKEN;
      return;
    }

    const { columns, rows } = parameter.value;

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

        let paramValue;
        try {
          paramValue = column.type.validate(value, parameter.collation);
        } catch (error) {
          throw new InputError(`TVP column '${column.name}' has invalid data at row index ${i}`, { cause: error });
        }

        const param = {
          value: paramValue,
          length: column.length,
          scale: column.scale,
          precision: column.precision
        };

        // TvpColumnData
        yield column.type.generateParameterLength(param, options);
        yield * column.type.generateParameterData(param, options);
      }
    }

    yield TVP_END_TOKEN;
  },

  validate: function(value): Buffer | null {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'object') {
      throw new TypeError('Invalid table.');
    }

    if (!Array.isArray(value.columns)) {
      throw new TypeError('Invalid table.');
    }

    if (!Array.isArray(value.rows)) {
      throw new TypeError('Invalid table.');
    }

    return value;
  },

  resolve(parameter, collation) {
    const value = parameter.value as TvpValue | null | undefined;

    // A TVP always serializes through `writeValueStream` (it has no
    // synchronous `writeValue`), whether its rows are an array or an async
    // iterable, so it is always `streamed`.
    const data: ParameterData<TvpValue | null> = { value: null, streamed: true };
    if (collation) {
      data.collation = collation;
    }

    if (value == null) {
      return data;
    }

    if (typeof value !== 'object' || !Array.isArray(value.columns)) {
      throw new TypeError('Invalid table.');
    }

    if (!Array.isArray(value.rows) && !isAsyncIterable(value.rows)) {
      throw new TypeError('Invalid table.');
    }

    data.value = value;

    return data;
  },

  writeTypeInfo(buffer, parameter) {
    const value = parameter.value as TvpValue | null;

    buffer.writeUInt8(this.id);
    // DbName
    buffer.writeBVarchar('', 'ucs2');
    // OwningSchema
    buffer.writeBVarchar(value?.schema ?? '', 'ucs2');
    // TypeName
    buffer.writeBVarchar(value?.name ?? '', 'ucs2');
  },

  writeValueStream(parameter, options) {
    const value = parameter.value as TvpValue | null;

    if (value == null) {
      return [NULL_TABLE];
    }

    if (Array.isArray(value.rows)) {
      return writeRows(value, value.rows, parameter.collation, options);
    }

    return writeRowsFrom(value, value.rows, parameter.collation, options);
  }
};

export default TVP;
module.exports = TVP;
