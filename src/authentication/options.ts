/**
 * Helpers for validating `config.authentication.options` in authentication
 * plugins.
 *
 * @private
 */

export function assertStringOption(options: Record<string, unknown>, name: string) {
  if (typeof options[name] !== 'string') {
    throw new TypeError(`The "config.authentication.options.${name}" property must be of type string.`);
  }
}

export function assertOptionalStringOption(options: Record<string, unknown>, name: string) {
  if (options[name] !== undefined && typeof options[name] !== 'string') {
    throw new TypeError(`The "config.authentication.options.${name}" property must be of type string.`);
  }
}
