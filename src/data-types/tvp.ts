import { type DataType, type ParameterData, writeTypeInfo, writeValue } from '../data-type';
import { type InternalConnectionOptions } from '../connection';
import { type Collation } from '../collation';
import { InputError } from '../errors';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';
import { isAsyncIterable } from './plp-stream';

const TVP_TYPE_ID = 0xF3;

const TVP_ROW_TOKEN = Buffer.from([0x01]);
const TVP_END_TOKEN = Buffer.from([0x00]);

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);

// A NULL table: no columns, and the end tokens of the column metadata and
// of the rows.
const NULL_TABLE = Buffer.from([0xFF, 0xFF, 0x00, 0x00]);

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

function validateTable(value: unknown): TvpValue | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'object' || !Array.isArray((value as TvpValue).columns)) {
    throw new TypeError('Invalid table.');
  }

  const rows = (value as TvpValue).rows;
  if (!Array.isArray(rows) && !isAsyncIterable(rows)) {
    throw new TypeError('Invalid table.');
  }

  return value as TvpValue;
}

function validateRow(columns: TvpColumn[], row: TvpRow, rowIndex: number, collation: Collation | undefined): TvpRow {
  if (!Array.isArray(row)) {
    throw new InputError(`TVP row at index ${rowIndex} is not an array`);
  }

  // Every declared column must have a value: the row metadata covers all
  // columns, so a shorter or longer row would desync the server's parse.
  if (row.length !== columns.length) {
    throw new InputError(`TVP row at index ${rowIndex} has ${row.length} value(s), but ${columns.length} column(s) are declared`);
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

function writeTvpTypeInfo(buffer: WritableTrackingBuffer, value: TvpValue | null) {
  buffer.writeUInt8(TVP_TYPE_ID);
  // DbName
  buffer.writeBVarchar('', 'ucs2');
  // OwningSchema
  buffer.writeBVarchar(value?.schema ?? '', 'ucs2');
  // TypeName
  buffer.writeBVarchar(value?.name ?? '', 'ucs2');
}

// The column metadata after the column count: one entry per column, then
// the end token.
function writeColumns(buffer: WritableTrackingBuffer, columns: TvpColumn[], options: InternalConnectionOptions) {
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

function writeColumnMetadata(buffer: WritableTrackingBuffer, value: TvpValue, options: InternalConnectionOptions) {
  buffer.writeUInt16LE(value.columns.length);
  writeColumns(buffer, value.columns, options);
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

// Rows given as an array are written in a synchronous loop, so the only
// asynchrony is the yield for every chunk's worth of rows.
async function * writeRows(buffer: WritableTrackingBuffer, value: TvpValue, rows: TvpRow[], collation: Collation | undefined, options: InternalConnectionOptions): AsyncGenerator<void, void> {
  writeColumnMetadata(buffer, value, options);

  for (let i = 0, len = rows.length; i < len; i++) {
    writeRow(buffer, value.columns, validateRow(value.columns, rows[i], i, collation), options);

    if (buffer.length >= WritableTrackingBuffer.CHUNK_SIZE) {
      yield;
    }
  }

  buffer.writeBuffer(TVP_END_TOKEN);
}

async function * writeRowsFrom(buffer: WritableTrackingBuffer, value: TvpValue, rows: AsyncIterable<TvpRow>, collation: Collation | undefined, options: InternalConnectionOptions): AsyncGenerator<void, void> {
  writeColumnMetadata(buffer, value, options);

  let rowIndex = 0;
  for await (const row of rows) {
    writeRow(buffer, value.columns, validateRow(value.columns, row, rowIndex++, collation), options);

    if (buffer.length >= WritableTrackingBuffer.CHUNK_SIZE) {
      yield;
    }
  }

  buffer.writeBuffer(TVP_END_TOKEN);
}

const TVP: DataType = {
  id: TVP_TYPE_ID,
  type: 'TVPTYPE',
  name: 'TVP',

  declaration: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.
    const schema = value.schema ? value.schema + '.' : '';
    return schema + value.name + ' readonly';
  },

  // The legacy serialization methods below are still required by the
  // `DataType` interface. They write the same bytes as `writeTypeInfo` and
  // `writeValueStream` through the same helpers, for rows given as an array.

  generateTypeInfo(parameter) {
    const buffer = new WritableTrackingBuffer();
    writeTvpTypeInfo(buffer, parameter.value as TvpValue | null);
    return buffer.data;
  },

  generateParameterLength(parameter) {
    const value = parameter.value as TvpValue | null;
    if (value == null) {
      return NULL_LENGTH;
    }

    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(value.columns.length, 0);
    return buffer;
  },

  *generateParameterData(parameter, options) {
    const value = parameter.value as TvpValue | null;
    if (value == null) {
      yield TVP_END_TOKEN;
      yield TVP_END_TOKEN;
      return;
    }

    if (!Array.isArray(value.rows)) {
      throw new TypeError('A TVP whose rows are an async iterable can only be written through writeValueStream.');
    }

    const buffer = new WritableTrackingBuffer();
    writeColumns(buffer, value.columns, options);
    for (let i = 0, len = value.rows.length; i < len; i++) {
      writeRow(buffer, value.columns, validateRow(value.columns, value.rows[i], i, parameter.collation), options);
    }
    buffer.writeBuffer(TVP_END_TOKEN);

    yield * buffer.getBuffers();
  },

  validate(value) {
    return validateTable(value);
  },

  resolve(parameter, collation) {
    // A TVP always serializes through `writeValueStream` (it has no
    // synchronous `writeValue`), whether its rows are an array or an async
    // iterable, so it is always `streamed`.
    const data: ParameterData<TvpValue | null> = { value: validateTable(parameter.value), streamed: true };
    if (collation) {
      data.collation = collation;
    }

    return data;
  },

  writeTypeInfo(buffer, parameter) {
    writeTvpTypeInfo(buffer, parameter.value as TvpValue | null);
  },

  async * writeValueStream(buffer, parameter, options) {
    const value = parameter.value as TvpValue | null;

    if (value == null) {
      buffer.writeBuffer(NULL_TABLE);
      return;
    }

    if (Array.isArray(value.rows)) {
      yield * writeRows(buffer, value, value.rows, parameter.collation, options);
      return;
    }

    yield * writeRowsFrom(buffer, value, value.rows, parameter.collation, options);
  }
};

export default TVP;
module.exports = TVP;
