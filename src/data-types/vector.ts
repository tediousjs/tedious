import { type DataType, type Parameter, type ParameterData } from '../data-type';

// SQL Server `vector` data type (VECTORTYPE, 0xF5).
//
// TYPE_INFO:  0xF5 | USHORT max length (bytes) | BYTE dimension type
// Value:      USHORT length (0xFFFF for NULL) | payload
// Payload:    BYTE layout format (0xA9) | BYTE layout version (0x01) |
//             USHORT dimension count | BYTE dimension type | 3 reserved bytes |
//             little-endian elements
//
// The same encoding is used for result set columns, RPC parameters, TVP
// columns and bulk load columns. The server only uses it after the
// VECTORSUPPORT feature extension was negotiated at login; without it,
// `vector` values are exchanged as JSON array text in `varchar(max)`.

const VECTOR_TYPE_ID = 0xF5;

/**
 * Size of the header that precedes the elements of a vector value.
 */
export const VECTOR_HEADER_LENGTH = 8;

const LAYOUT_FORMAT = 0xA9;
const LAYOUT_VERSION = 0x01;

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);

/**
 * The largest value (header and elements) a `vector` can hold.
 */
const MAX_VECTOR_LENGTH = 8000;

/**
 * Versions of the VECTORSUPPORT feature extension.
 */
export const VECTOR_SUPPORT_VERSION = {
  /** `vector` with `float32` elements. */
  V1: 0x01,
  /** `vector` with `float32` or `float16` elements. */
  V2: 0x02
} as const;

/**
 * Values of the dimension type byte in a vector's TYPE_INFO and header.
 */
export const VECTOR_DIMENSION_TYPE = {
  FLOAT32: 0x00,
  FLOAT16: 0x01
} as const;

/**
 * A `vector` parameter, column or cell value: an array of numbers, or a
 * `Float32Array`. One element per dimension.
 */
export type VectorValue = number[] | Float32Array;

interface ElementType {
  dimensionType: number;
  bytesPerElement: number;
  maxDimensions: number;
  // The minimum negotiated VECTORSUPPORT version that can transport it.
  minVersion: number;
  // The T-SQL base type, as used in a declaration.
  baseType: 'float32' | 'float16';
  // Rounds a number to the element type's precision.
  round(value: number): number;
  write(buffer: Buffer, value: number, offset: number): void;
  read(buffer: Buffer, offset: number): number;
}

const FLOAT16_MIN_NORMAL = 2 ** -14;
const FLOAT16_MIN_SUBNORMAL = 2 ** -24;
// Values of this magnitude or above round to infinity (65504 is the largest
// finite float16, 65536 the next power of two; 65520 is halfway between).
const FLOAT16_OVERFLOW = 65520;

// Rounds to the nearest integer, ties to even, like IEEE 754 does.
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction > 0.5) {
    return floor + 1;
  }
  if (fraction < 0.5) {
    return floor;
  }
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Encodes a number as an IEEE 754 half-precision (binary16) float, rounding
 * to nearest, ties to even.
 */
export function toFloat16Bits(value: number): number {
  if (Number.isNaN(value)) {
    return 0x7E00;
  }

  const sign = value < 0 || Object.is(value, -0) ? 0x8000 : 0;
  const abs = Math.abs(value);

  if (abs >= FLOAT16_OVERFLOW) {
    return sign | 0x7C00;
  }

  if (abs < FLOAT16_MIN_NORMAL) {
    // Subnormal (or zero). Rounding up to 0x400 yields the smallest normal
    // number, which is the correct encoding.
    return sign | roundHalfEven(abs / FLOAT16_MIN_SUBNORMAL);
  }

  let exponent = Math.floor(Math.log2(abs));
  // `Math.log2` may be off by one close to powers of two.
  if (2 ** exponent > abs) {
    exponent--;
  } else if (2 ** (exponent + 1) <= abs) {
    exponent++;
  }

  // Exact: dividing by a power of two, subtracting 1 from a value in [1, 2)
  // and multiplying by a power of two do not round.
  let mantissa = roundHalfEven((abs / 2 ** exponent - 1) * 1024);
  if (mantissa === 1024) {
    mantissa = 0;
    exponent++;
  }

  if (exponent > 15) {
    return sign | 0x7C00;
  }

  return sign | ((exponent + 15) << 10) | mantissa;
}

/**
 * Decodes an IEEE 754 half-precision (binary16) float.
 */
export function fromFloat16Bits(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1F;
  const mantissa = bits & 0x3FF;

  if (exponent === 0) {
    return sign * mantissa * FLOAT16_MIN_SUBNORMAL;
  }

  if (exponent === 0x1F) {
    return mantissa === 0 ? sign * Infinity : NaN;
  }

  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

const FLOAT32: ElementType = {
  dimensionType: VECTOR_DIMENSION_TYPE.FLOAT32,
  bytesPerElement: 4,
  maxDimensions: (MAX_VECTOR_LENGTH - VECTOR_HEADER_LENGTH) / 4,
  minVersion: VECTOR_SUPPORT_VERSION.V1,
  baseType: 'float32',
  round: Math.fround,
  write(buffer, value, offset) {
    buffer.writeFloatLE(value, offset);
  },
  read(buffer, offset) {
    return buffer.readFloatLE(offset);
  }
};

const FLOAT16: ElementType = {
  dimensionType: VECTOR_DIMENSION_TYPE.FLOAT16,
  bytesPerElement: 2,
  maxDimensions: (MAX_VECTOR_LENGTH - VECTOR_HEADER_LENGTH) / 2,
  minVersion: VECTOR_SUPPORT_VERSION.V2,
  baseType: 'float16',
  round(value) {
    return fromFloat16Bits(toFloat16Bits(value));
  },
  write(buffer, value, offset) {
    buffer.writeUInt16LE(toFloat16Bits(value), offset);
  },
  read(buffer, offset) {
    return fromFloat16Bits(buffer.readUInt16LE(offset));
  }
};

function validateVector(value: unknown, elementType: ElementType): VectorValue | null {
  if (value == null) {
    return null;
  }

  if (!Array.isArray(value) && !(value instanceof Float32Array)) {
    throw new TypeError('Invalid vector: the value must be an array of numbers or a Float32Array.');
  }

  validateDimensions(value.length, elementType);

  // Error messages name the offending index, but do not quote the value:
  // they end up in the `EPARAM` error and the debug log.
  for (let i = 0, len = value.length; i < len; i++) {
    const element: unknown = value[i];
    if (typeof element !== 'number') {
      throw new TypeError(`Invalid vector: the element at index ${i} is not a number.`);
    }

    if (!Number.isFinite(element)) {
      throw new TypeError(`Invalid vector: the element at index ${i} is not a finite number.`);
    }

    if (!Number.isFinite(elementType.round(element))) {
      throw new TypeError(`Invalid vector: the element at index ${i} is out of range for ${elementType.baseType}.`);
    }
  }

  return value;
}

function validateDimensions(dimensions: number, elementType: ElementType) {
  if (!Number.isInteger(dimensions) || dimensions < 1) {
    throw new TypeError('Invalid vector: a vector must have at least one dimension.');
  }

  if (dimensions > elementType.maxDimensions) {
    throw new TypeError(`Invalid vector: a ${elementType.baseType} vector can have at most ${elementType.maxDimensions} dimensions, but ${dimensions} were given.`);
  }
}

// The dimension count of a parameter or column: its `length`, if given,
// otherwise the number of elements of its value.
function resolveDimensions(parameter: Pick<ParameterData, 'length' | 'value'>, elementType: ElementType): number {
  const value = parameter.value as VectorValue | null | undefined;

  if (parameter.length != null) {
    validateDimensions(parameter.length, elementType);

    if (value != null && value.length !== parameter.length) {
      throw new TypeError(`Invalid vector: the value has ${value.length} dimension(s), but ${parameter.length} were declared.`);
    }

    return parameter.length;
  }

  if (value != null) {
    return value.length;
  }

  throw new TypeError('The number of dimensions of a vector must be specified with the `length` option when its value is null.');
}

function encodeVector(value: VectorValue, elementType: ElementType): Buffer {
  const dimensions = value.length;
  const buffer = Buffer.alloc(VECTOR_HEADER_LENGTH + dimensions * elementType.bytesPerElement);
  buffer.writeUInt8(LAYOUT_FORMAT, 0);
  buffer.writeUInt8(LAYOUT_VERSION, 1);
  buffer.writeUInt16LE(dimensions, 2);
  buffer.writeUInt8(elementType.dimensionType, 4);
  // Bytes 5 - 7 are reserved and zero.

  let offset = VECTOR_HEADER_LENGTH;
  for (let i = 0; i < dimensions; i++) {
    elementType.write(buffer, value[i], offset);
    offset += elementType.bytesPerElement;
  }

  return buffer;
}

function elementTypeForDimensionType(dimensionType: number): ElementType {
  switch (dimensionType) {
    case VECTOR_DIMENSION_TYPE.FLOAT32:
      return FLOAT32;
    case VECTOR_DIMENSION_TYPE.FLOAT16:
      return FLOAT16;
    default:
      throw new Error(`Unsupported vector dimension type 0x${dimensionType.toString(16).padStart(2, '0')}`);
  }
}

/**
 * Decodes a `vector` value received from the server. `dimensionType` is the
 * dimension type from the column's TYPE_INFO, which the value's header must
 * match.
 */
export function decodeVector(data: Buffer, dimensionType: number): number[] {
  const elementType = elementTypeForDimensionType(dimensionType);

  if (data.length < VECTOR_HEADER_LENGTH) {
    throw new Error(`Invalid vector value: expected at least ${VECTOR_HEADER_LENGTH} bytes, but got ${data.length}`);
  }

  if (data[0] !== LAYOUT_FORMAT || data[1] !== LAYOUT_VERSION) {
    throw new Error(`Unsupported vector layout 0x${data[0].toString(16)} version ${data[1]}`);
  }

  if (data[4] !== dimensionType) {
    throw new Error(`Invalid vector value: dimension type 0x${data[4].toString(16)} does not match the column's dimension type 0x${dimensionType.toString(16)}`);
  }

  const dimensions = data.readUInt16LE(2);
  const expectedLength = VECTOR_HEADER_LENGTH + dimensions * elementType.bytesPerElement;
  if (data.length !== expectedLength) {
    throw new Error(`Invalid vector value: ${dimensions} ${elementType.baseType} dimension(s) require ${expectedLength} bytes, but got ${data.length}`);
  }

  const result = new Array<number>(dimensions);
  let offset = VECTOR_HEADER_LENGTH;
  for (let i = 0; i < dimensions; i++) {
    result[i] = elementType.read(data, offset);
    offset += elementType.bytesPerElement;
  }
  return result;
}

/**
 * The dimension count of a `vector` column, derived from the maximum length
 * and dimension type of its TYPE_INFO.
 */
export function vectorDimensionsFromTypeInfo(maxLength: number, dimensionType: number): number {
  const elementType = elementTypeForDimensionType(dimensionType);
  const dataLength = maxLength - VECTOR_HEADER_LENGTH;
  if (dataLength <= 0 || dataLength % elementType.bytesPerElement !== 0) {
    throw new Error(`Invalid vector TYPE_INFO: length ${maxLength} is not valid for ${elementType.baseType} elements`);
  }
  return dataLength / elementType.bytesPerElement;
}

export type VectorDataType = DataType & {
  /** The dimension type byte of the TYPE_INFO. */
  dimensionType: number;
  /** The minimum negotiated VECTORSUPPORT version required to send it. */
  minVersion: number;
};

function createVectorType(name: 'Vector' | 'VectorFloat16', elementType: ElementType): VectorDataType {
  return {
    id: VECTOR_TYPE_ID,
    type: 'VECTOR',
    name: name,
    dimensionType: elementType.dimensionType,
    minVersion: elementType.minVersion,

    declaration(parameter: Parameter) {
      const dimensions = resolveDimensions(parameter, elementType);
      return elementType === FLOAT32 ? `vector(${dimensions})` : `vector(${dimensions}, ${elementType.baseType})`;
    },

    resolveLength(parameter: Parameter) {
      return resolveDimensions(parameter, elementType);
    },

    resolve(parameter) {
      const value = validateVector(parameter.value, elementType);
      return { value, length: resolveDimensions({ length: parameter.length, value }, elementType) };
    },

    writeTypeInfo(buffer, parameter) {
      const dimensions = resolveDimensions({ length: parameter.length, value: null }, elementType);
      buffer.writeUInt8(VECTOR_TYPE_ID);
      buffer.writeUInt16LE(VECTOR_HEADER_LENGTH + dimensions * elementType.bytesPerElement);
      buffer.writeUInt8(elementType.dimensionType);
    },

    writeValue(buffer, parameter) {
      const value = parameter.value as VectorValue | null | undefined;
      if (value == null) {
        buffer.writeBuffer(NULL_LENGTH);
        return;
      }

      // Bulk load and TVP cells are validated on their own; their
      // dimensions must match the column's.
      resolveDimensions({ length: parameter.length, value }, elementType);

      const data = encodeVector(value, elementType);
      buffer.writeUInt16LE(data.length);
      buffer.writeBuffer(data);
    },

    validate(value): VectorValue | null {
      return validateVector(value, elementType);
    }
  };
}

/**
 * `vector(n)`: a vector of `float32` elements.
 */
export const Vector = createVectorType('Vector', FLOAT32);

/**
 * `vector(n, float16)`: a vector of half-precision `float16` elements.
 */
export const VectorFloat16 = createVectorType('VectorFloat16', FLOAT16);

/**
 * The vector data type for the dimension type of a `vector` TYPE_INFO.
 */
export function vectorTypeForDimensionType(dimensionType: number): VectorDataType {
  return elementTypeForDimensionType(dimensionType) === FLOAT32 ? Vector : VectorFloat16;
}

/**
 * The VECTORSUPPORT version a data type requires to be sent to the server,
 * or 0 if it is not a vector type.
 */
export function requiredVectorSupportVersion(type: DataType): number {
  return type === Vector || type === VectorFloat16 ? (type as VectorDataType).minVersion : 0;
}

export default Vector;
