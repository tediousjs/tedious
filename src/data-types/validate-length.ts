import { type DataType } from '../data-type';
import { InputError } from '../errors';

/**
 * Checks a length that was explicitly specified for a parameter or column.
 *
 * A length the type cannot be declared with (`0`, a negative or fractional
 * length, or one above the type's maximum) is rejected here rather than
 * sent: the server rejects it with an error that does not say what is
 * wrong, and a bulk load can even accept it and silently store the wrong
 * value.
 *
 * `NaN` is accepted for the types with a `max` form, where it has always
 * declared `max`.
 */
export function validateLength(type: DataType, length: number) {
  const maximum = type.maximumLength;
  if (maximum === undefined) {
    return;
  }

  if (Number.isInteger(length) && length >= 1 && length <= maximum) {
    return;
  }

  if (type.hasMax && typeof length === 'number' && (length > maximum || Number.isNaN(length))) {
    return;
  }

  const expected = type.hasMax ?
    `an integer between 1 and ${maximum}, or a larger length (e.g. \`Infinity\`) for ${type.name}(max)` :
    `an integer between 1 and ${maximum}`;
  throw new InputError(`Invalid length ${String(length)} for ${type.name}: expected ${expected}.`);
}
