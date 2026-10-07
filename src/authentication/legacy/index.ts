import { type AuthenticationProvider } from '../provider';
import { type AzureAuthentication, createAzureAuthenticationProvider } from './azure';
import { createNtlmAuthenticationProvider } from './ntlm';

export { type TokenCredential, isTokenCredential } from './azure';

interface NtlmAuthentication {
  type: 'ntlm';
  options: {
    /**
     * User name from your windows account.
     */
    userName: string;
    /**
     * Password from your windows account.
     */
    password: string;
    /**
     * Once you set domain for ntlm authentication type, driver will connect to SQL Server using domain login.
     *
     * This is necessary for forming a connection using ntlm type
     */
    domain: string;
  };
}

/**
 * The built-in authentication types other than `default`.
 *
 * These are deprecated in favor of passing an [[AuthenticationProvider]]
 * as `config.authentication`, and will be removed in a future version.
 */
export type LegacyAuthentication = NtlmAuthentication | AzureAuthentication;

const deprecationWarningsEmitted = new Set<LegacyAuthentication['type']>();

/**
 * Emits a deprecation warning (once per process and authentication type)
 * for the given legacy authentication type.
 *
 * @private
 */
export function emitLegacyAuthenticationDeprecationWarning(type: LegacyAuthentication['type']) {
  if (deprecationWarningsEmitted.has(type)) {
    return;
  }
  deprecationWarningsEmitted.add(type);

  process.emitWarning(
    `The \`${type}\` authentication type is deprecated and will be removed in a future version of \`tedious\`. ` +
    'Pass an authentication provider via `config.authentication` instead.',
    { type: 'DeprecationWarning', code: 'TEDIOUS_DEP_AUTHENTICATION_TYPE' }
  );
}

/**
 * Creates an [[AuthenticationProvider]] that implements one of the deprecated,
 * built-in authentication types.
 *
 * @private
 */
export function createLegacyAuthenticationProvider(authentication: LegacyAuthentication): AuthenticationProvider {
  emitLegacyAuthenticationDeprecationWarning(authentication.type);

  if (authentication.type === 'ntlm') {
    return createNtlmAuthenticationProvider(authentication.options);
  }

  return createAzureAuthenticationProvider(authentication);
}
