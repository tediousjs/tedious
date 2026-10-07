import { type AuthenticationProvider, isAuthenticationProvider } from './provider';
import { defaultAuthenticationPlugin } from './default';
import { legacyAuthenticationPlugins } from './legacy';

/**
 * An authentication plugin makes an [[AuthenticationProvider]] usable from
 * JSON based configurations.
 *
 * Once registered via [[registerAuthenticationPlugin]], the plugin is
 * selected by setting `authentication.type` to the plugin's `type`, and
 * `authentication.options` is passed to `createProvider`:
 *
 * ```js
 * const { registerAuthenticationPlugin, Connection } = require('tedious');
 *
 * registerAuthenticationPlugin({
 *   type: 'kerberos',
 *   createProvider(options) {
 *     if (typeof options.realm !== 'string') {
 *       throw new TypeError('The "config.authentication.options.realm" property must be of type string.');
 *     }
 *
 *     return new KerberosAuthenticationProvider(options);
 *   }
 * });
 *
 * const connection = new Connection({
 *   server: 'localhost',
 *   authentication: { type: 'kerberos', options: { realm: 'EXAMPLE.COM' } }
 * });
 * ```
 */
export interface AuthenticationPlugin<Options extends object = any> {
  /**
   * The `authentication.type` value that selects this plugin.
   */
  readonly type: string;

  /**
   * Creates the [[AuthenticationProvider]] for a connection.
   *
   * This is called when a [[Connection]] is created, with the
   * `authentication.options` from its configuration (or an empty object if
   * none were given). Validate the options here, and throw a `TypeError` if
   * they are invalid, so configuration errors surface immediately.
   *
   * @param options The `authentication.options` from the configuration.
   */
  createProvider(options: Options): AuthenticationProvider;
}

const plugins = new Map<string, AuthenticationPlugin>();

/**
 * Registers an [[AuthenticationPlugin]], so that its authentication type can
 * be used in connection configurations.
 *
 * Registering the same plugin more than once has no effect. Registering a
 * different plugin for an authentication type that is already registered
 * throws an error.
 *
 * @param plugin The plugin to register.
 */
export function registerAuthenticationPlugin(plugin: AuthenticationPlugin) {
  if (typeof plugin !== 'object' || plugin === null) {
    throw new TypeError('The "plugin" argument must be of type object.');
  }

  if (typeof plugin.type !== 'string' || plugin.type === '') {
    throw new TypeError('The "plugin.type" property must be a non-empty string.');
  }

  if (typeof plugin.createProvider !== 'function') {
    throw new TypeError('The "plugin.createProvider" property must be of type function.');
  }

  const existing = plugins.get(plugin.type);
  if (existing === plugin) {
    return;
  }

  if (existing !== undefined) {
    throw new Error(`An authentication plugin for the "${plugin.type}" authentication type is already registered.`);
  }

  plugins.set(plugin.type, plugin);
}

/**
 * Creates the [[AuthenticationProvider]] for the given authentication type
 * and options, using the registered [[AuthenticationPlugin]].
 *
 * @private
 */
export function createAuthenticationProviderFromConfig(type: string, options: object): AuthenticationProvider {
  const plugin = plugins.get(type);

  if (plugin === undefined) {
    const types = Array.from(plugins.keys(), (type) => `"${type}"`).join(', ');
    throw new TypeError(
      `The "config.authentication.type" property must be one of the registered authentication types (${types}). ` +
      `If "${type}" is provided by a plugin, register the plugin with \`registerAuthenticationPlugin()\` before creating the connection.`
    );
  }

  const provider = plugin.createProvider(options);

  if (!isAuthenticationProvider(provider)) {
    throw new TypeError(`The authentication plugin for the "${type}" authentication type did not return an authentication provider.`);
  }

  return provider;
}

registerAuthenticationPlugin(defaultAuthenticationPlugin);
for (const plugin of legacyAuthenticationPlugins) {
  registerAuthenticationPlugin(plugin);
}
