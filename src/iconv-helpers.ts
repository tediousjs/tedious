import iconv, { type DecoderStream } from 'iconv-lite';

const decoders = new Map<string, DecoderStream>();

/**
 * Returns a cached decoder instance for the given encoding.
 *
 * `iconv.decode` canonicalizes the encoding name and creates a new decoder
 * object on every call. For the small values typically found in rows, this
 * costs more than the actual decoding. Instead, cache a decoder instance per
 * encoding and reuse it via `decodeWith`.
 */
export function getCachedDecoder(encoding: string): DecoderStream {
  let decoder = decoders.get(encoding);
  if (decoder === undefined) {
    decoder = iconv.getDecoder(encoding);
    decoders.set(encoding, decoder);
  }

  return decoder;
}

/**
 * Decode `buf` using the given (cached) decoder, like `iconv.decode` does.
 *
 * Reusing a decoder is safe here because decoding happens synchronously and
 * `end()` resets any state that stateful (multi-byte) decoders keep between
 * `write()` calls.
 */
export function decodeWith(decoder: DecoderStream, buf: Buffer): string {
  const result = decoder.write(buf);
  const trail = decoder.end();

  return trail ? result + trail : result;
}

/**
 * Decode `buf` using the given encoding, like `iconv.decode` does, but with
 * the decoder cached per encoding.
 */
export function decode(buf: Buffer, encoding: string): string {
  return decodeWith(getCachedDecoder(encoding), buf);
}
