import { type BuiltInAuthenticationPlugin } from '../plugin';
import { type AzureAuthentication, azureAuthenticationPlugins } from './azure';
import { type NtlmAuthentication, ntlmAuthenticationPlugin } from './ntlm';

/**
 * The built-in authentication types other than `default`.
 *
 * These are deprecated in favor of authentication providers, and will be
 * removed in a future version.
 */
export type LegacyAuthentication = NtlmAuthentication | AzureAuthentication;

/**
 * The plugins implementing the deprecated, built-in authentication types.
 *
 * @private
 */
export const legacyAuthenticationPlugins: BuiltInAuthenticationPlugin[] = [
  ntlmAuthenticationPlugin,
  ...azureAuthenticationPlugins
];
