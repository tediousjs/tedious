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
//
// There is a single `TYPES.Vector` data type. Its base type (`float32` or
// `float16`), selected with the `baseType` option, determines the dimension
// type byte, the element encoding and the maximum number of dimensions.

const VECTOR_TYPE_ID = 0xF5;

/**
 * Size of the header that precedes the elements of a vector value.
 */
const VECTOR_HEADER_LENGTH = 8;

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
const VECTOR_DIMENSION_TYPE = {
  FLOAT32: 0x00,
  FLOAT16: 0x01
} as const;

/**
 * A `vector` parameter, column or cell value: an array of numbers, or a
 * `Float32Array`. One element per dimension.
 */
type VectorValue = number[] | Float32Array;

/**
 * The base type of a `vector`'s elements, as in `vector(n, float16)`.
 * `float32` is the default.
 */
export type VectorBaseType = 'float32' | 'float16';

interface ElementType {
  dimensionType: number;
  bytesPerElement: number;
  maxDimensions: number;
  // The minimum negotiated VECTORSUPPORT version that can transport it.
  minVersion: number;
  // The T-SQL base type, as used in a declaration.
  baseType: VectorBaseType;
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
function toFloat16Bits(value: number): number {
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
function fromFloat16Bits(bits: number): number {
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

// The element type for a `baseType` option; `float32` if it is not given.
function elementTypeForBaseType(baseType: unknown): ElementType {
  switch (baseType) {
    case undefined:
    case null:
    case 'float32':
      return FLOAT32;
    case 'float16':
      return FLOAT16;
    default:
      throw new TypeError('Invalid vector base type: the `baseType` option must be \'float32\' or \'float16\'.');
  }
}

/**
 * Validates a `baseType` option and returns the base type it selects:
 * `float32` if it is not given.
 */
export function validateVectorBaseType(baseType: unknown): VectorBaseType {
  return elementTypeForBaseType(baseType).baseType;
}

// Checks that a value is a vector: an array of finite numbers or a
// `Float32Array`, with at least one element. Whether it fits a base type is
// checked by `validateForBaseType` once the base type is known: by `resolve`
// for parameters, and by `writeValue` for bulk load and TVP cells.
function validateVector(value: unknown): VectorValue | null {
  if (value == null) {
    return null;
  }

  if (!Array.isArray(value) && !(value instanceof Float32Array)) {
    throw new TypeError('Invalid vector: the value must be an array of numbers or a Float32Array.');
  }

  if (value.length === 0) {
    throw new TypeError('Invalid vector: a vector must have at least one dimension.');
  }

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
  }

  return value;
}

// Checks a vector against a base type: its number of dimensions, and that
// no element rounds to infinity.
function validateForBaseType(value: VectorValue, elementType: ElementType) {
  validateDimensions(value.length, elementType);

  for (let i = 0, len = value.length; i < len; i++) {
    if (!Number.isFinite(elementType.round(value[i]))) {
      throw new TypeError(`Invalid vector: the element at index ${i} is out of range for ${elementType.baseType}.`);
    }
  }
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
 * Decodes a `vector` value received from the server. `baseType` is the base
 * type from the column's TYPE_INFO, which the value's header must match.
 */
export function decodeVector(data: Buffer, baseType: VectorBaseType): number[] {
  const elementType = elementTypeForBaseType(baseType);
  const dimensionType = elementType.dimensionType;

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

/**
 * The base type of a `vector` column, from the dimension type of its
 * TYPE_INFO.
 */
export function vectorBaseTypeFromDimensionType(dimensionType: number): VectorBaseType {
  return elementTypeForDimensionType(dimensionType).baseType;
}

/**
 * `vector(n)` or `vector(n, float16)`. The number of dimensions is given with
 * the `length` option (inferred from a non-null parameter value), and the base
 * type with the `baseType` option (`float32` by default).
 */
export const Vector: DataType = {
  id: VECTOR_TYPE_ID,
  type: 'VECTOR',
  name: 'Vector',

  declaration(parameter: Parameter) {
    const elementType = elementTypeForBaseType(parameter.baseType);
    const dimensions = resolveDimensions(parameter, elementType);
    return elementType === FLOAT32 ? `vector(${dimensions})` : `vector(${dimensions}, ${elementType.baseType})`;
  },

  resolveLength(parameter: Parameter) {
    return resolveDimensions(parameter, elementTypeForBaseType(parameter.baseType));
  },

  resolve(parameter) {
    const elementType = elementTypeForBaseType(parameter.baseType);
    const value = validateVector(parameter.value);
    if (value !== null) {
      validateForBaseType(value, elementType);
    }

    return {
      value: value,
      length: resolveDimensions({ length: parameter.length, value }, elementType),
      baseType: elementType.baseType
    };
  },

  writeTypeInfo(buffer, parameter) {
    const elementType = elementTypeForBaseType(parameter.baseType);
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

    const elementType = elementTypeForBaseType(parameter.baseType);

    // Bulk load and TVP cells are only checked by `validate`: their
    // dimensions must match the column's, and fit its base type.
    resolveDimensions({ length: parameter.length, value }, elementType);
    validateForBaseType(value, elementType);

    const data = encodeVector(value, elementType);
    buffer.writeUInt16LE(data.length);
    buffer.writeBuffer(data);
  },

  validate(value): VectorValue | null {
    return validateVector(value);
  }
};

/**
 * The VECTORSUPPORT version needed to send a value of the given data type
 * and, for `TYPES.Vector`, base type; 0 if it is not a vector type.
 */
export function requiredVectorSupportVersion(type: DataType, baseType?: VectorBaseType): number {
  return type === Vector ? elementTypeForBaseType(baseType).minVersion : 0;
}

export default Vector;
