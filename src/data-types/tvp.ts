import { type DataType, type ParameterData } from '../data-type';
import { InputError } from '../errors';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const TVP_ROW_TOKEN = Buffer.from([0x01]);
const TVP_END_TOKEN = Buffer.from([0x00]);

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);

// SPIKE: knob for measuring the cost of the yield granularity of streamed
// rows. 'row' encodes each row into a single buffer, 'cell' yields the length
// prefix and data of each cell separately (the pre-spike behavior).
const ROW_GRANULARITY = process.env.TEDIOUS_SPIKE_TVP_GRANULARITY === 'cell' ? 'cell' : 'row';

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

// Rows validated up-front (i.e. rows that were given as an array), keyed by
// the user's table value, so that the streaming path can use them without
// validating them again - and without modifying the user's value.
const validatedRowsByValue = new WeakMap<object, TvpRow[]>();

function isIterable(value: any): value is Iterable<unknown> | AsyncIterable<unknown> {
  return value != null && (typeof value[Symbol.iterator] === 'function' || typeof value[Symbol.asyncIterator] === 'function');
}

function validateRow(columns: TvpColumn[], row: TvpRow, rowIndex: number, collation: ParameterData['collation']): TvpRow {
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

  async * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      yield TVP_END_TOKEN;
      yield TVP_END_TOKEN;
      return;
    }

    const value = parameter.value as TvpValue;
    const { columns } = value;

    const validatedRows = validatedRowsByValue.get(value);
    const rows = validatedRows ?? value.rows;
    const validated = validatedRows !== undefined;

    for (let i = 0, len = columns.length; i < len; i++) {
      const column = columns[i];

      const buff = Buffer.alloc(6);
      // UserType
      buff.writeUInt32LE(0x00000000, 0);

      // Flags
      buff.writeUInt16LE(0x0000, 4);
      yield buff;

      // TYPE_INFO
      yield column.type.generateTypeInfo({ value: undefined, length: column.length, precision: column.precision, scale: column.scale }, options);

      // ColName
      yield Buffer.from([0x00]);
    }

    yield TVP_END_TOKEN;

    let rowIndex = 0;
    for await (const sourceRow of rows) {
      const row = validated ? sourceRow : validateRow(columns, sourceRow, rowIndex, parameter.collation);

      if (ROW_GRANULARITY === 'row') {
        // One buffer per row: keeps the number of (asynchronous) yields
        // proportional to the number of rows, not cells.
        const rowBuffer = new WritableTrackingBuffer(64, null, true);
        rowBuffer.writeBuffer(TVP_ROW_TOKEN);

        for (let k = 0, len = row.length; k < len; k++) {
          const column = columns[k];
          const param = { value: row[k], length: column.length, scale: column.scale, precision: column.precision };

          rowBuffer.writeBuffer(column.type.generateParameterLength(param, options));
          // TVP member columns are scalar types, whose data is generated synchronously.
          for (const chunk of column.type.generateParameterData(param, options) as Generator<Buffer, void>) {
            rowBuffer.writeBuffer(chunk);
          }
        }

        yield rowBuffer.data;
      } else {
        yield TVP_ROW_TOKEN;

        for (let k = 0, len = row.length; k < len; k++) {
          const column = columns[k];
          const param = { value: row[k], length: column.length, scale: column.scale, precision: column.precision };

          yield column.type.generateParameterLength(param, options);
          yield * column.type.generateParameterData(param, options) as Generator<Buffer, void>;
        }
      }

      rowIndex++;
    }

    yield TVP_END_TOKEN;
  },

  validate: function(value, collation): TvpValue | null {
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

    // The non-streaming case is built on top of the streaming one: rows
    // given as an array are validated up-front, so that invalid data is
    // reported before anything is sent to the server. Streamed rows can only
    // be validated as they arrive.
    if (Array.isArray(value.rows)) {
      const rows = value.rows as TvpRow[];
      const validatedRows = new Array(rows.length);
      for (let i = 0, len = rows.length; i < len; i++) {
        validatedRows[i] = validateRow(value.columns, rows[i], i, collation);
      }

      validatedRowsByValue.set(value, validatedRows);
    }

    return value;
  }
};

export default TVP;
module.exports = TVP;
