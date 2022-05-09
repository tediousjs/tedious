import { AbortSignal } from 'node-abort-controller';
import { finished, Readable, Writable } from 'stream';
import { AbortError } from './abort-error';

/**
 * Attaches an AbortSignal to a readable or writeable stream.
 *
 * Inspired by `stream.addAbortSignal` that was added in NodeJS v15.4.0.
 */
export function addAbortSignal(signal: AbortSignal, stream: Readable | Writable) {
  const onAbort = () => { stream.destroy(new AbortError()); };

  signal.addEventListener('abort', onAbort, { once: true });
  finished(stream, () => { signal.removeEventListener('abort', onAbort); });

  return stream;
}
