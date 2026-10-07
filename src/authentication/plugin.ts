import { type AuthenticationProvider, isAuthenticationProvider } from './provider';
import { defaultAuthenticationPlugin } from './default';
import { legacyAuthenticationPlugins } from './legacy';

/**
 * An authentication plugin makes an [[AuthenticationProvider]] usable from
 * JSON based configurations.
 *
 * Plugins are passed to a [[Connection]] via the `authenticationPlugins`
 * extension. A plugin is selected by setting `authentication.type` in the
 * configuration to the plugin's `type`, and `authentication.options` is
 * passed to `createProvider`:
 *
 * ```js
 * const kerberos = {
 *   type: 'kerberos',
 *   createProvider(options) {
 *     if (typeof options.realm !== 'string') {
 *       throw new TypeError('The "config.authentication.options.realm" property must be of type string.');
 *     }
 *
 *     return new KerberosAuthenticationProvider(options);
 *   }
 * };
 *
 * // `config` can come from a JSON file, e.g.
 * // { "server": "localhost", "authentication": { "type": "kerberos", "options": { "realm": "EXAMPLE.COM" } } }
 * const connection = new Connection(config, { authenticationPlugins: [kerberos] });
 * ```
 */
export interface AuthenticationPlugin<Options extends object = any> {
  /**
   * The `authentication.type` value that selects this plugin.
   *
   * This can be the name of one of the built-in authentication types, in
   * which case the plugin is used instead of the built-in implementation.
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

/**
 * The built-in authentication types.
 */
const builtInAuthenticationPlugins: ReadonlyMap<string, AuthenticationPlugin> = new Map(
  [defaultAuthenticationPlugin, ...legacyAuthenticationPlugins].map((plugin) => [plugin.type, plugin])
);

/**
 * Validates the `authenticationPlugins` passed to a connection, and returns
 * all authentication plugins available to it, keyed by their type.
 *
 * @private
 */
export function resolveAuthenticationPlugins(plugins: unknown): ReadonlyMap<string, AuthenticationPlugin> {
  if (plugins === undefined) {
    return builtInAuthenticationPlugins;
  }

  if (!Array.isArray(plugins)) {
    throw new TypeError('The "extensions.authenticationPlugins" property must be an array.');
  }

  const resolved = new Map(builtInAuthenticationPlugins);
  const seen = new Set<string>();

  plugins.forEach((plugin: AuthenticationPlugin, index) => {
    const name = `extensions.authenticationPlugins[${index}]`;

    if (typeof plugin !== 'object' || plugin === null) {
      throw new TypeError(`The "${name}" property must be of type object.`);
    }

    if (typeof plugin.type !== 'string' || plugin.type === '') {
      throw new TypeError(`The "${name}.type" property must be a non-empty string.`);
    }

    if (typeof plugin.createProvider !== 'function') {
      throw new TypeError(`The "${name}.createProvider" property must be of type function.`);
    }

    if (seen.has(plugin.type)) {
      throw new TypeError(`The "extensions.authenticationPlugins" property contains more than one plugin for the "${plugin.type}" authentication type.`);
    }
    seen.add(plugin.type);

    resolved.set(plugin.type, plugin);
  });

  return resolved;
}

/**
 * Creates the [[AuthenticationProvider]] for the given authentication type
 * and options, using the matching [[AuthenticationPlugin]].
 *
 * @private
 */
export function createAuthenticationProviderFromConfig(plugins: ReadonlyMap<string, AuthenticationPlugin>, type: string, options: object): AuthenticationProvider {
  const plugin = plugins.get(type);

  if (plugin === undefined) {
    const types = Array.from(plugins.keys(), (type) => `"${type}"`).join(', ');
    throw new TypeError(
      `The "config.authentication.type" property must be one of the available authentication types (${types}). ` +
      `If "${type}" is provided by a plugin, pass the plugin to the connection via \`extensions.authenticationPlugins\`.`
    );
  }

  const provider = plugin.createProvider(options);

  if (!isAuthenticationProvider(provider)) {
    throw new TypeError(`The authentication plugin for the "${type}" authentication type did not return an authentication provider.`);
  }

  return provider;
}
