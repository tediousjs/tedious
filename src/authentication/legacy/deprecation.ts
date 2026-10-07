const deprecationWarningsEmitted = new Set<string>();

/**
 * Emits a deprecation warning (once per process and authentication type)
 * for one of the deprecated, built-in authentication types.
 *
 * @private
 */
export function emitLegacyAuthenticationDeprecationWarning(type: string) {
  if (deprecationWarningsEmitted.has(type)) {
    return;
  }
  deprecationWarningsEmitted.add(type);

  process.emitWarning(
    `The \`${type}\` authentication type is deprecated and will be removed in a future version of \`tedious\`. ` +
    'Use an authentication provider instead.',
    { type: 'DeprecationWarning', code: 'TEDIOUS_DEP_AUTHENTICATION_TYPE' }
  );
}
