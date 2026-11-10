import { type ColumnEncryptionKeyStoreProvider } from './key-store-provider';
import { type ColumnEncryptionOptions, type InternalColumnEncryptionOptions, type RequestColumnEncryption } from './types';

const DEFAULT_KEY_CACHE_TTL = 2 * 60 * 60 * 1000;
const DEFAULT_PARAMETER_METADATA_CACHE_SIZE = 1000;

/**
 * Validates the `columnEncryption` option of a connection, and applies its
 * defaults.
 */
export function validateColumnEncryptionOptions(options: ColumnEncryptionOptions): InternalColumnEncryptionOptions {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('The "config.options.columnEncryption" property must be of type object.');
  }

  const { keyStoreProviders, keyCacheTTL = DEFAULT_KEY_CACHE_TTL, trustedKeyPaths, parameterMetadataCacheSize = DEFAULT_PARAMETER_METADATA_CACHE_SIZE } = options;

  if (typeof keyStoreProviders !== 'object' || keyStoreProviders === null) {
    throw new TypeError('The "config.options.columnEncryption.keyStoreProviders" property must be of type object.');
  }

  const providers = new Map<string, ColumnEncryptionKeyStoreProvider>();
  for (const [name, provider] of Object.entries(keyStoreProviders)) {
    if (typeof provider?.decryptColumnEncryptionKey !== 'function') {
      throw new TypeError(`The "config.options.columnEncryption.keyStoreProviders.${name}" property must be a key store provider: an object with a "decryptColumnEncryptionKey" method.`);
    }

    providers.set(name, provider);
  }

  if (typeof keyCacheTTL !== 'number' || !(keyCacheTTL >= 0)) {
    throw new TypeError('The "config.options.columnEncryption.keyCacheTTL" property must be a non-negative number.');
  }

  if (trustedKeyPaths !== undefined && (!Array.isArray(trustedKeyPaths) || !trustedKeyPaths.every((keyPath) => typeof keyPath === 'string'))) {
    throw new TypeError('The "config.options.columnEncryption.trustedKeyPaths" property must be an array of strings.');
  }

  if (!Number.isInteger(parameterMetadataCacheSize) || parameterMetadataCacheSize < 0) {
    throw new TypeError('The "config.options.columnEncryption.parameterMetadataCacheSize" property must be a non-negative integer.');
  }

  return {
    keyStoreProviders: providers,
    keyCacheTTL,
    trustedKeyPaths: trustedKeyPaths && new Set(trustedKeyPaths.map((keyPath: string) => keyPath.toLowerCase())),
    parameterMetadataCacheSize
  };
}

const REQUEST_COLUMN_ENCRYPTION: readonly unknown[] = ['enabled', 'resultSetOnly', 'disabled'];

/**
 * Validates the `columnEncryption` option of a request.
 */
export function validateRequestColumnEncryption(value: unknown): RequestColumnEncryption | undefined {
  if (value !== undefined && !REQUEST_COLUMN_ENCRYPTION.includes(value)) {
    throw new TypeError('The "options.columnEncryption" property must be one of "enabled", "resultSetOnly" or "disabled".');
  }

  return value as RequestColumnEncryption | undefined;
}
