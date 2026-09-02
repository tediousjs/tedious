import { type DataType, type Parameter, type ParameterData, isAsyncIterable, resolveParameter, writeTypeInfo, writeValue } from '../data-type';
import WritableBufferList, { CHUNK_SIZE } from '../writable-buffer-list';
import { type InternalConnectionOptions } from '../connection';
import { Collation } from '../collation';
import { InputError } from '../errors';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const TVP_ROW_TOKEN = Buffer.from([0x01]);
const TVP_END_TOKEN = Buffer.from([0x00]);

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);

interface TvpColumn {
  name: string;
  type: DataType;
  length?: number;
  precision?: number;
  scale?: number;
}

type TvpRow = unknown[];

interface TvpValue {
  name?: string;
  schema?: string;
  columns: TvpColumn[];
  // Rows are streamed: any iterable or async iterable of rows works. Arrays
  // are just a special case of a synchronous, fully materialized source.
  rows: Iterable<TvpRow> | AsyncIterable<TvpRow>;
}

// The resolved form of a table-valued parameter: the member columns'
// resolved declarations, and the rows (validated up-front when they came
// from an array).
interface ResolvedTvpValue {
  name?: string | undefined;
  schema?: string | undefined;
  columns: { name: string, type: DataType, resolved: ParameterData, cell: ParameterData }[];
  rows: Iterable<TvpRow> | AsyncIterable<TvpRow>;
  validated: boolean;
}

function isIterable(value: any): value is Iterable<unknown> | AsyncIterable<unknown> {
  return value != null && (typeof value[Symbol.iterator] === 'function' || typeof value[Symbol.asyncIterator] === 'function');
}

function validateRow(columns: ResolvedTvpValue['columns'], row: TvpRow, rowIndex: number, collation: Collation | undefined, options: InternalConnectionOptions): TvpRow {
  if (!Array.isArray(row)) {
    throw new InputError(`TVP row at index ${rowIndex} is not an array`);
  }

  const validated = new Array(row.length);
  for (let k = 0, len = row.length; k < len; k++) {
    const column = columns[k];

    try {
      validated[k] = column.type.validate(row[k], collation, options);
    } catch (error) {
      throw new InputError(`TVP column '${column.name}' has invalid data at row index ${rowIndex}`, { cause: error });
    }
  }

  return validated;
}

async function * writeRows(sink: WritableBufferList, columns: ResolvedTvpValue['columns'], rows: ResolvedTvpValue['rows'], validated: boolean, collation: Collation | undefined, options: InternalConnectionOptions): AsyncIterable<void> {
  let rowIndex = 0;
  for await (const sourceRow of rows) {
    const row = validated ? sourceRow : validateRow(columns, sourceRow, rowIndex, collation, options);

    sink.append(TVP_ROW_TOKEN);

    for (let k = 0, len = row.length; k < len; k++) {
      const column = columns[k];
      column.cell.value = row[k];

      if (isAsyncIterable(writeValue(column.type, sink, column.cell, options))) {
        throw new InputError(`TVP column '${column.name}' has a type whose values cannot be serialized synchronously`);
      }
    }

    // Hand control back to the caller once a chunk's worth of rows has been
    // written, so that it can be sent while the next rows are produced.
    if (sink.length >= CHUNK_SIZE) {
      yield;
    }

    rowIndex++;
  }

  sink.append(TVP_END_TOKEN);
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

  resolve(parameter, collation, options) {
    const value = this.validate(parameter.value, collation, options) as TvpValue | null;
    if (value == null) {
      return { value: null, collation };
    }

    const columns = value.columns.map((column) => {
      const columnParameter: Parameter = { type: column.type, name: column.name, value: null, output: false, length: column.length, precision: column.precision, scale: column.scale };
      const resolved = resolveParameter(columnParameter, collation, options);
      // A scratch struct that is reused for every cell of this column.
      return { name: column.name, type: column.type, resolved, cell: { ...resolved } };
    });

    // The non-streaming case is built on top of the streaming one: rows
    // given as an array are validated up-front, so that invalid data is
    // reported before anything is sent to the server. Streamed rows can
    // only be validated as they arrive.
    let rows = value.rows;
    let validated = false;
    if (Array.isArray(rows)) {
      const validatedRows = new Array(rows.length);
      for (let i = 0, len = rows.length; i < len; i++) {
        validatedRows[i] = validateRow(columns, rows[i], i, collation, options);
      }
      rows = validatedRows;
      validated = true;
    }

    const resolved: ResolvedTvpValue = { name: value.name, schema: value.schema, columns, rows, validated };
    return { value: resolved, collation };
  },

  writeTypeInfo(sink, parameter, options) {
    sink.append(this.generateTypeInfo(parameter, options));
  },

  writeValue(sink, parameter, options) {
    if (parameter.value == null) {
      sink.append(NULL_LENGTH);
      sink.append(TVP_END_TOKEN);
      sink.append(TVP_END_TOKEN);
      return;
    }

    const { columns, rows, validated } = parameter.value as ResolvedTvpValue;

    sink.writeUInt16LE(columns.length);

    for (let i = 0, len = columns.length; i < len; i++) {
      const column = columns[i];

      // UserType
      sink.writeUInt32LE(0x00000000);

      // Flags
      sink.writeUInt16LE(0x0000);

      // TYPE_INFO
      writeTypeInfo(column.type, sink, column.resolved, options);

      // ColName
      sink.writeUInt8(0x00);
    }

    sink.append(TVP_END_TOKEN);

    return writeRows(sink, columns, rows, validated, parameter.collation, options);
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

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    const { columns } = parameter.value as TvpValue;
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(columns.length, 0);
    return buffer;
  },

  * generateParameterData(): Generator<Buffer, void> {
    // Table-valued parameters stream their rows and can only be serialized
    // via `serializeValue`.
    throw new Error('Table-valued parameters must be serialized via `writeValue`');
  },

  validate: function(value): TvpValue | null {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'object') {
      throw new TypeError('Invalid table.');
    }

    if (!Array.isArray(value.columns)) {
      throw new TypeError('Invalid table.');
    }

    if (!isIterable(value.rows)) {
      throw new TypeError('Invalid table.');
    }

    return value;
  }
};

export default TVP;
module.exports = TVP;
