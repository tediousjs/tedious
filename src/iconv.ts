// `iconv-lite` is an optional peer dependency. Text is decoded without it (see
// `text-encoding.ts`), and it is only needed to encode non-ASCII text in a
// legacy (non-UTF-8) code page, so it is loaded on first use.
//
// It is loaded with a synchronous `require`, as the data type writers that
// need it are synchronous, and both tedious and `iconv-lite` are CommonJS.

/**
 * The part of `iconv-lite`'s API that tedious uses.
 */
export interface Iconv {
  encode(content: string, encoding: string): Buffer;
  getEncoder(encoding: string): { write(str: string): Buffer, end(): Buffer | undefined };
}

/**
 * Loads `iconv-lite`. Replaced in tests to simulate the package being missing.
 *
 * @private
 */
export const iconvLoader = {
  load(): Iconv {
    return require('iconv-lite');
  }
};

let iconv: Iconv | undefined;

function isIconvNotFound(error: unknown): boolean {
  return error instanceof Error &&
    (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND' &&
    error.message.includes('\'iconv-lite\'');
}

/**
 * The type the error message suggests instead: Unicode types are sent as
 * UTF-16 and never need `iconv-lite`.
 */
const UNICODE_ALTERNATIVE: { [typeName: string]: string } = {
  Char: 'NChar',
  VarChar: 'NVarChar',
  Text: 'NVarChar'
};

/**
 * Returns `iconv-lite`, loading it on first use.
 *
 * @param codepage The code page the text is to be encoded in, for the error
 *   message if `iconv-lite` is not installed.
 * @param typeName The name of the data type being encoded, for the error
 *   message if `iconv-lite` is not installed.
 *
 * @private
 */
export function loadIconv(codepage: string, typeName: string): Iconv {
  if (iconv === undefined) {
    try {
      iconv = iconvLoader.load();
    } catch (error) {
      if (!isIconvNotFound(error)) {
        throw error;
      }

      const alternative = UNICODE_ALTERNATIVE[typeName] ?? 'NVarChar';
      throw new Error(
        `Sending non-ASCII text as ${typeName} with code page ${codepage} requires the \`iconv-lite\` package. ` +
        `Install it, or send the value as ${alternative}.`,
        { cause: error }
      );
    }
  }

  return iconv;
}

/**
 * Forgets the loaded `iconv-lite`, so the next `loadIconv` loads it again.
 * Only for tests.
 *
 * @private
 */
export function resetIconv() {
  iconv = undefined;
}
