import iconv, { type DecoderStream } from 'iconv-lite';

const decoders = new Map<string, DecoderStream>();

/**
 * Decode `buf` using the given encoding, like `iconv.decode` does.
 *
 * `iconv.decode` canonicalizes the encoding name and creates a new decoder
 * object on every call. For the small values typically found in rows, this
 * costs more than the actual decoding. Instead, cache a decoder instance per
 * encoding and reuse it.
 *
 * Reusing a decoder is safe here because decoding happens synchronously and
 * `end()` resets any state that stateful (multi-byte) decoders keep between
 * `write()` calls.
 */
export function decode(buf: Buffer, encoding: string): string {
  let decoder = decoders.get(encoding);
  if (decoder === undefined) {
    decoder = iconv.getDecoder(encoding);
    decoders.set(encoding, decoder);
  }

  const result = decoder.write(buf);
  const trail = decoder.end();

  return trail ? result + trail : result;
}
