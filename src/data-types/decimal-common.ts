import type WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const MASK_64 = (1n << 64n) - 1n;

/**
 * The number of bytes the magnitude of a `decimal` or `numeric` value takes
 * at `precision`.
 */
export function decimalLength(precision: number | undefined): 4 | 8 | 12 | 16 {
  if (precision! <= 9) {
    return 4;
  } else if (precision! <= 19) {
    return 8;
  } else if (precision! <= 28) {
    return 12;
  } else {
    return 16;
  }
}

/**
 * Writes the TYPE_INFO of a `decimal` or `numeric` column: the nullable type
 * id, the length of a value, and the precision and scale.
 */
export function writeDecimalTypeInfo(buffer: WritableTrackingBuffer, id: number, precision: number | undefined, scale: number | undefined): void {
  buffer.writeUInt8(id);
  buffer.writeUInt8(decimalLength(precision) + 1);
  buffer.writeUInt8(precision!);
  buffer.writeUInt8(scale!);
}

/**
 * Writes a validated `decimal` or `numeric` value: the length, the sign,
 * and the scaled magnitude as a little-endian unsigned integer spanning the
 * full width for the precision. `name` names the type in the error for a
 * value that does not fit.
 */
export function writeDecimal(buffer: WritableTrackingBuffer, value: number | null, precision: number | undefined, scale: number | undefined, name: string): void {
  if (value == null) {
    buffer.writeUInt8(0x00);
    return;
  }

  const dataLength = decimalLength(precision);

  // A BigInt holds magnitudes beyond 2^64 for high-precision columns.
  // See https://github.com/tediousjs/tedious/issues/1733
  const magnitude = BigInt(Math.round(Math.abs(value * Math.pow(10, scale!))));

  // Throwing surfaces a catchable error to the caller instead of silently
  // truncating the magnitude.
  if (magnitude >= (1n << BigInt(8 * dataLength))) {
    throw new RangeError(`Value ${value} is out of range for ${name}(${precision}, ${scale}).`);
  }

  buffer.writeUInt8(dataLength + 1);
  buffer.writeUInt8(value < 0 ? 0 : 1);

  switch (dataLength) {
    case 4:
      buffer.writeUInt32LE(Number(magnitude));
      break;
    case 8:
      buffer.writeBigUInt64LE(magnitude);
      break;
    case 12:
      buffer.writeBigUInt64LE(magnitude & MASK_64);
      buffer.writeUInt32LE(Number(magnitude >> 64n));
      break;
    case 16:
      buffer.writeBigUInt64LE(magnitude & MASK_64);
      buffer.writeBigUInt64LE(magnitude >> 64n);
      break;
  }
}
