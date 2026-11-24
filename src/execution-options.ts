import { RequestError } from './errors';

/**
 * Options of a single execution of a {@link Request} or {@link BulkLoad}.
 *
 * @experimental
 */
export interface ExecutionOptions {
  /**
   * Cancels the execution when aborted. The execution then completes with a
   * {@link RequestError} whose `code` is `'ABORT_ERR'`, whose `name` is
   * `'AbortError'`, and whose `cause` is the signal's `reason`, instead of a
   * cancellation error. This is the same shape as the `AbortError` that
   * Node.js' own APIs, e.g. `fs.readFile()` or `events.once()`, fail with.
   *
   * A signal created with `AbortSignal.timeout()` also fails the execution
   * with this error, not with the `ETIMEOUT` error of the request timeout
   * ({@link ConnectionOptions.requestTimeout}). Its `cause` is then a
   * `DOMException` whose `name` is `'TimeoutError'`:
   *
   * ```js
   * const request = new Request('SELECT ...', (err) => {
   *   if (err?.code === 'ABORT_ERR' && err.cause?.name === 'TimeoutError') {
   *     // The execution took longer than 30 seconds.
   *   }
   * });
   *
   * connection.execSql(request, { signal: AbortSignal.timeout(30_000) });
   * ```
   *
   * If the signal is aborted already, the request is not sent at all.
   *
   * If the execution was canceled otherwise before the signal was aborted,
   * via `cancel()` or by a request timeout, it completes with that
   * cancellation's error instead. If the server does not acknowledge the
   * cancellation within {@link ConnectionOptions.cancelTimeout}, the
   * connection is closed and the execution fails with that connection error.
   *
   * As with `cancel()`, an error that the execution ran into before it was
   * canceled, e.g. an error returned by the server or a parameter value that
   * failed to stream, is either reported or replaced by the abort error,
   * depending on how far the execution got.
   */
  signal?: AbortSignal | undefined;
}

/**
 * Create the error an execution that was canceled by an abort signal
 * completes with. It follows Node.js' own `AbortError`, so it can be told
 * apart from a request timeout (`ETIMEOUT`) and from `cancel()` (`ECANCEL`),
 * while the signal's reason, which can be any value, is kept as its `cause`.
 *
 * @private
 */
export function abortError(signal: AbortSignal) {
  const error = new RequestError('The operation was aborted', 'ABORT_ERR', { cause: signal.reason });
  error.name = 'AbortError';
  return error;
}
