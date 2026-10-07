/**
 * Formats a number as upper-case hexadecimal, zero-padded to `width` digits.
 *
 * Equivalent to the `%0<width>X` conversion of `sprintf-js`, which this
 * replaces: the value is converted to an unsigned 32-bit integer first, so a
 * negative number wraps (-1 becomes FFFFFFFF) rather than gaining a minus
 * sign, and a value wider than `width` is never truncated.
 */
export function formatHex(value: number, width: number): string {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}
