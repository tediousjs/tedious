import { ConnectionError } from '../../errors';

/**
 * Loads a package that is only needed by one of the deprecated, built-in
 * authentication types, and is therefore not a hard dependency of `tedious`.
 *
 * @private
 */
export async function loadOptionalDependency<T>(packageName: string, authenticationType: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    throw new ConnectionError(
      `The \`${authenticationType}\` authentication type requires the \`${packageName}\` package, which could not be loaded. ` +
      `Install it with \`npm install ${packageName}\`, or pass an authentication provider via \`config.authentication\` instead.`,
      'ELOGIN',
      { cause: err }
    );
  }
}
