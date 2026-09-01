import { type DataType, type ParameterData } from '../data-type';
import { endianness } from 'os';

// The binary layout of a vector value, as described in MS-TDS s2.2.5.5.7:
// an 8-byte header ([0] layout format, [1] layout version, [2..3] number of
// dimensions, [4] dimension type, [5..7] reserved), followed by one
// little-endian value per dimension.
export const VECTOR_HEADER_SIZE = 8;
export const VECTOR_LAYOUT_FORMAT = 0xA9;
export const VECTOR_LAYOUT_VERSION = 0x01;
export const VECTOR_DIMENSION_TYPE_FLOAT32 = 0x00;
const FLOAT32_SIZE = 4;

// The server restricts vectors to a total of 8000 bytes, leaving room for
// 1998 float32 dimensions after the 8 byte header.
export const MAX_DIMENSIONS = 1998;

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);

// On little-endian platforms, the bytes of a `Float32Array` already match
// the wire representation and can be copied over in bulk.
export const isLittleEndianPlatform = endianness() === 'LE';

// The number of dimensions declared by a parameter. The value takes
// precedence over any explicitly specified length, so that the type info
// written for a parameter always agrees with the value bytes that follow it.
function resolveDimensions(parameter: ParameterData): number {
  const value = parameter.value as Float32Array | null;
  if (value != null) {
    return value.length;
  } else if (parameter.length != null) {
    return parameter.length;
  } else {
    return 1;
  }
}

function assertValidDimensions(dimensions: number) {
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > MAX_DIMENSIONS) {
    throw new TypeError('Vector parameters must have between 1 and ' + MAX_DIMENSIONS + ' dimensions.');
  }
}

const Vector: { maximumDimensions: number } & DataType = {
  id: 0xF5,
  type: 'VECTOR',
  name: 'Vector',
  maximumDimensions: MAX_DIMENSIONS,

  declaration: function(parameter) {
    const dimensions = resolveDimensions(parameter);
    assertValidDimensions(dimensions);
    return 'vector(' + dimensions + ')';
  },

  resolveLength: function(parameter) {
    return resolveDimensions(parameter);
  },

  generateTypeInfo: function(parameter) {
    const dimensions = resolveDimensions(parameter);
    assertValidDimensions(dimensions);

    const buffer = Buffer.alloc(4);
    buffer.writeUInt8(this.id, 0);
    buffer.writeUInt16LE(VECTOR_HEADER_SIZE + (dimensions * FLOAT32_SIZE), 1);
    buffer.writeUInt8(VECTOR_DIMENSION_TYPE_FLOAT32, 3);
    return buffer;
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    const value = parameter.value as Float32Array;
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(VECTOR_HEADER_SIZE + (value.length * FLOAT32_SIZE), 0);
    return buffer;
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    const value = parameter.value as Float32Array;

    const buffer = Buffer.alloc(VECTOR_HEADER_SIZE + (value.length * FLOAT32_SIZE));
    buffer.writeUInt8(VECTOR_LAYOUT_FORMAT, 0);
    buffer.writeUInt8(VECTOR_LAYOUT_VERSION, 1);
    buffer.writeUInt16LE(value.length, 2);
    buffer.writeUInt8(VECTOR_DIMENSION_TYPE_FLOAT32, 4);
    // Bytes 5..7 are reserved and remain zero.

    if (isLittleEndianPlatform) {
      Buffer.from(value.buffer, value.byteOffset, value.byteLength).copy(buffer, VECTOR_HEADER_SIZE);
    } else {
      for (let i = 0; i < value.length; i++) {
        buffer.writeFloatLE(value[i], VECTOR_HEADER_SIZE + (i * FLOAT32_SIZE));
      }
    }

    yield buffer;
  },

  validate: function(value): Float32Array | null {
    if (value == null) {
      return null;
    }

    // Only `Float32Array` values are accepted, as vectors store single
    // precision floats. Narrowing a `number` array is left to the caller so
    // that the loss of precision is always explicit.
    if (!(value instanceof Float32Array)) {
      throw new TypeError('Vector parameter values must be of type `Float32Array`. Wrap an array of numbers with `new Float32Array(values)` - note that this converts the values to single precision floats.');
    }

    if (value.length < 1 || value.length > MAX_DIMENSIONS) {
      throw new TypeError('Vector parameter values must have between 1 and ' + MAX_DIMENSIONS + ' dimensions.');
    }

    return value;
  }
};

// Note: no `module.exports` compatibility assignment here (unlike the other
// data type modules), as it would shadow this module's named exports.
export default Vector;
