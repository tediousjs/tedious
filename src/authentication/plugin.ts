import { createRequire } from 'module';
import path from 'path';

import { type AuthenticationProvider, isAuthenticationProvider } from './provider';
import { defaultAuthenticationPlugin } from './default';
import { legacyAuthenticationPlugins } from './legacy';

/**
 * An authentication plugin is a package that makes an
 * [[AuthenticationProvider]] usable from JSON based configurations.
 *
 * Setting `authentication.type` in the configuration to anything other than
 * one of the built-in authentication types loads the plugin package for that
 * type, and calls its `createProvider` export with `authentication.options`:
 *
 * | `authentication.type` | Plugin package                |
 * | --------------------- | ----------------------------- |
 * | `kerberos`            | `tedious-auth-kerberos`       |
 * | `@acme/kerberos`      | `@acme/tedious-auth-kerberos` |
 * | `@acme`               | `@acme/tedious-auth`          |
 *
 * The full package name can be used as well (e.g. `tedious-auth-kerberos`).
 *
 * The package must be loadable with `require()`: either CommonJS, or ESM
 * without top-level `await`. It exports `createProvider`, either directly
 * or on its default export:
 *
 * ```js
 * // tedious-auth-kerberos/index.js
 * exports.createProvider = function(options) {
 *   if (typeof options.realm !== 'string') {
 *     throw new TypeError('The "config.authentication.options.realm" property must be of type string.');
 *   }
 *
 *   return new KerberosAuthenticationProvider(options);
 * };
 * ```
 *
 * ```json
 * { "server": "localhost", "authentication": { "type": "kerberos", "options": { "realm": "EXAMPLE.COM" } } }
 * ```
 *
 * The package is looked up from `tedious` itself first, and then from the
 * current working directory. When using pnpm with `hoist=false` or with the
 * global virtual store, `tedious` cannot see packages it does not depend on,
 * so declare the plugin as a peer dependency of `tedious` via pnpm's
 * `packageExtensions` setting:
 *
 * ```json
 * "pnpm": {
 *   "packageExtensions": {
 *     "tedious": { "peerDependencies": { "tedious-auth-kerberos": "*" } }
 *   }
 * }
 * ```
 */
export interface AuthenticationPlugin<Options extends object = any> {
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
 * An authentication plugin that is built into `tedious`.
 *
 * @private
 */
export interface BuiltInAuthenticationPlugin<Options extends object = any> extends AuthenticationPlugin<Options> {
  readonly type: string;
}

/**
 * The built-in authentication types. These take precedence over plugin
 * packages.
 */
const builtInAuthenticationPlugins: ReadonlyMap<string, AuthenticationPlugin> = new Map(
  [defaultAuthenticationPlugin, ...legacyAuthenticationPlugins].map((plugin) => [plugin.type, plugin])
);

const PACKAGE_PREFIX = 'tedious-auth';

function withPackagePrefix(name: string) {
  return name === PACKAGE_PREFIX || name.startsWith(`${PACKAGE_PREFIX}-`) ? name : `${PACKAGE_PREFIX}-${name}`;
}

/**
 * Returns the name of the plugin package that provides the given
 * authentication type.
 *
 * Only valid package names are accepted, so a configuration can never load
 * anything other than a package that follows the plugin naming convention.
 *
 * @private
 */
export function getAuthenticationPluginPackageName(type: string): string {
  const match = /^(?:(@[a-z0-9][a-z0-9._~-]*)(?:\/([a-z0-9][a-z0-9._~-]*))?|([a-z0-9][a-z0-9._~-]*))$/.exec(type);

  if (match === null) {
    throw new TypeError(`The "config.authentication.type" property must be the name of a built-in authentication type or of an authentication plugin, but "${type}" is neither.`);
  }

  const [, scope, scopedName, name] = match;

  if (scope === undefined) {
    return withPackagePrefix(name);
  }

  if (scopedName === undefined) {
    return `${scope}/${PACKAGE_PREFIX}`;
  }

  return `${scope}/${withPackagePrefix(scopedName)}`;
}

/**
 * Finds the plugin package, first from `tedious` itself, and then from the
 * current working directory.
 */
function resolveAuthenticationPluginPackage(packageName: string): string | undefined {
  const bases = [__filename, path.join(process.cwd(), 'noop.js')];

  for (const base of bases) {
    try {
      return createRequire(base).resolve(packageName);
    } catch (err: any) {
      if (err?.code !== 'MODULE_NOT_FOUND') {
        throw new Error(`Failed to load the "${packageName}" authentication plugin: ${err?.message ?? err}`, { cause: err });
      }
    }
  }

  return undefined;
}

/**
 * Loads the plugin package that provides the given authentication type.
 *
 * @private
 */
export function loadAuthenticationPlugin(type: string): AuthenticationPlugin {
  const packageName = getAuthenticationPluginPackageName(type);
  const resolved = resolveAuthenticationPluginPackage(packageName);

  if (resolved === undefined) {
    throw new Error(
      `The "${type}" authentication type is provided by the "${packageName}" package, which could not be found. ` +
      `Install it with \`npm install ${packageName}\`. When using pnpm with \`hoist=false\` or the global virtual store, ` +
      'also declare it as a peer dependency of `tedious` via the `packageExtensions` setting.'
    );
  }

  let exports;
  try {
    exports = createRequire(__filename)(resolved);
  } catch (err: any) {
    throw new Error(`Failed to load the "${packageName}" authentication plugin: ${err?.message ?? err}`, { cause: err });
  }

  for (const plugin of [exports, exports?.default]) {
    if (typeof plugin?.createProvider === 'function') {
      return plugin;
    }
  }

  throw new TypeError(`The "${packageName}" package is not an authentication plugin, as it does not export a \`createProvider\` function.`);
}

/**
 * Creates the [[AuthenticationProvider]] for the given authentication type
 * and options, using the built-in authentication type or the plugin package
 * of that name.
 *
 * @private
 */
export function createAuthenticationProviderFromConfig(type: string, options: object): AuthenticationProvider {
  const plugin = builtInAuthenticationPlugins.get(type) ?? loadAuthenticationPlugin(type);
  const provider = plugin.createProvider(options);

  if (!isAuthenticationProvider(provider)) {
    throw new TypeError(`The authentication plugin for the "${type}" authentication type did not return an authentication provider.`);
  }

  return provider;
}
