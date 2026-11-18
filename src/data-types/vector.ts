import { endianness } from 'os';

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
// Values are typed arrays: a `Float32Array` for `vector(n)` and a
// `Float16Array` for `vector(n, float16)`.

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

const IS_LITTLE_ENDIAN = endianness() === 'LE';

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

// TypeScript's ES2024 library has no `Float16Array`, and Node.js 22 does not
// provide it at runtime.
interface Float16ArrayValue extends ArrayBufferView, ArrayLike<number> {}

interface Float16ArrayConstructorLike {
  new(buffer: ArrayBufferLike): Float16ArrayValue;
}

const Float16ArrayConstructor = (globalThis as typeof globalThis & { Float16Array?: Float16ArrayConstructorLike }).Float16Array;

/**
 * Whether this version of Node.js has `Float16Array`, which is required for
 * `float16` vectors.
 */
export const FLOAT16_ARRAY_SUPPORTED = typeof Float16ArrayConstructor === 'function';

/**
 * A `vector` value: one element per dimension.
 */
type VectorValue = Float32Array | Float16ArrayValue;

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
  isValue(value: unknown): value is VectorValue;
  createValue(buffer: ArrayBuffer): VectorValue;
  swapBytes(buffer: Buffer): void;
}

const FLOAT32: ElementType = {
  dimensionType: VECTOR_DIMENSION_TYPE.FLOAT32,
  bytesPerElement: 4,
  maxDimensions: (MAX_VECTOR_LENGTH - VECTOR_HEADER_LENGTH) / 4,
  minVersion: VECTOR_SUPPORT_VERSION.V1,
  baseType: 'float32',
  isValue(value): value is Float32Array {
    return value instanceof Float32Array;
  },
  createValue(buffer) {
    return new Float32Array(buffer);
  },
  swapBytes(buffer) {
    buffer.swap32();
  }
};

const FLOAT16: ElementType = {
  dimensionType: VECTOR_DIMENSION_TYPE.FLOAT16,
  bytesPerElement: 2,
  maxDimensions: (MAX_VECTOR_LENGTH - VECTOR_HEADER_LENGTH) / 2,
  minVersion: VECTOR_SUPPORT_VERSION.V2,
  baseType: 'float16',
  isValue(value): value is Float16ArrayValue {
    return Float16ArrayConstructor !== undefined && value instanceof Float16ArrayConstructor;
  },
  createValue(buffer) {
    if (Float16ArrayConstructor === undefined) {
      throw new Error('Cannot decode a float16 vector because Float16Array is not available in this version of Node.js.');
    }

    return new Float16ArrayConstructor(buffer);
  },
  swapBytes(buffer) {
    buffer.swap16();
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

function elementTypeForValue(value: unknown): ElementType | undefined {
  if (FLOAT32.isValue(value)) {
    return FLOAT32;
  }

  if (FLOAT16.isValue(value)) {
    return FLOAT16;
  }

  return undefined;
}

// A typed array value determines its own base type. An explicit `baseType`
// is only needed when there is no value, and must match a value if given.
function elementTypeForParameter(baseType: unknown, value: unknown): ElementType {
  const explicit = baseType == null ? undefined : elementTypeForBaseType(baseType);
  const fromValue = elementTypeForValue(value);

  if (explicit !== undefined && fromValue !== undefined && explicit !== fromValue) {
    throw new TypeError(`Invalid vector: a ${fromValue.baseType} value does not match the ${explicit.baseType} base type.`);
  }

  return fromValue ?? explicit ?? FLOAT32;
}

/**
 * Validates a `baseType` option and returns the base type it selects:
 * `float32` if it is not given.
 */
export function validateVectorBaseType(baseType: unknown): VectorBaseType {
  return elementTypeForBaseType(baseType).baseType;
}

function validateVector(value: unknown): VectorValue | null {
  if (value == null) {
    return null;
  }

  if (elementTypeForValue(value) === undefined) {
    throw new TypeError('Invalid vector: the value must be a Float32Array or a Float16Array.');
  }

  const vector = value as VectorValue;
  if (vector.length === 0) {
    throw new TypeError('Invalid vector: a vector must have at least one dimension.');
  }

  // Error messages name the offending index, but do not quote the value:
  // they end up in the `EPARAM` error and the debug log.
  for (let i = 0, len = vector.length; i < len; i++) {
    if (!Number.isFinite(vector[i])) {
      throw new TypeError(`Invalid vector: the element at index ${i} is not a finite number.`);
    }
  }

  return vector;
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
    validateDimensions(value.length, elementType);
    return value.length;
  }

  throw new TypeError('The number of dimensions of a vector must be specified with the `length` option when its value is null.');
}

function encodeVector(value: VectorValue, elementType: ElementType): Buffer {
  const buffer = Buffer.alloc(VECTOR_HEADER_LENGTH + value.byteLength);
  buffer.writeUInt8(LAYOUT_FORMAT, 0);
  buffer.writeUInt8(LAYOUT_VERSION, 1);
  buffer.writeUInt16LE(value.length, 2);
  buffer.writeUInt8(elementType.dimensionType, 4);
  // Bytes 5 - 7 are reserved and zero.

  const elements = buffer.subarray(VECTOR_HEADER_LENGTH);
  elements.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  if (!IS_LITTLE_ENDIAN) {
    elementType.swapBytes(elements);
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
export function decodeVector(data: Buffer, baseType: VectorBaseType): VectorValue {
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

  // Copy the elements so the typed array is aligned and independent of the
  // network buffer.
  const elements = new ArrayBuffer(expectedLength - VECTOR_HEADER_LENGTH);
  const bytes = Buffer.from(elements);
  data.copy(bytes, 0, VECTOR_HEADER_LENGTH);
  if (!IS_LITTLE_ENDIAN) {
    elementType.swapBytes(bytes);
  }

  return elementType.createValue(elements);
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
 * `vector(n)` or `vector(n, float16)`. A typed array value determines the
 * base type; the `baseType` option is needed when there is no value.
 */
export const Vector: DataType = {
  id: VECTOR_TYPE_ID,
  type: 'VECTOR',
  name: 'Vector',

  declaration(parameter: Parameter) {
    const elementType = elementTypeForParameter(parameter.baseType, parameter.value);
    const dimensions = resolveDimensions(parameter, elementType);
    return elementType === FLOAT32 ? `vector(${dimensions})` : `vector(${dimensions}, ${elementType.baseType})`;
  },

  resolveLength(parameter: Parameter) {
    return resolveDimensions(parameter, elementTypeForParameter(parameter.baseType, parameter.value));
  },

  resolve(parameter) {
    const value = validateVector(parameter.value);
    const elementType = elementTypeForParameter(parameter.baseType, value);

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
    if (!elementType.isValue(value)) {
      throw new TypeError(`Invalid vector: the value does not match the ${elementType.baseType} base type.`);
    }

    // Bulk load and TVP cells must match the column's dimension count.
    resolveDimensions({ length: parameter.length, value }, elementType);

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
