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
   * cancellation error.
   *
   * If the signal is aborted already, the request is not sent at all.
   */
  signal?: AbortSignal | undefined;
}

/**
 * A request or bulk load, as far as its cancellation is concerned.
 *
 * @private
 */
interface Execution {
  canceled: boolean;
  callback: (error: Error | null | undefined, ...rest: any[]) => void;
  cancel(): void;
}

/**
 * Create the error an execution that was canceled by an abort signal
 * completes with. It follows Node.js' own `AbortError`, so it can be told
 * apart from a request timeout (`ETIMEOUT`) and from `cancel()` (`ECANCEL`),
 * while the signal's reason, which can be any value, is kept as its `cause`.
 *
 * @private
 */
function abortError(signal: AbortSignal) {
  const error = new RequestError('The operation was aborted', 'ABORT_ERR', { cause: signal.reason });
  error.name = 'AbortError';
  return error;
}

/**
 * Cancel the current execution of the given request or bulk load once the
 * signal is aborted, and let it complete with an abort error instead of the
 * cancellation error.
 *
 * The execution's `callback` is replaced until the execution completed, so
 * this must only be called once the execution is certain to call back.
 *
 * @private
 */
export function abortOnSignal(execution: Execution, signal: AbortSignal | undefined) {
  if (signal === undefined) {
    return;
  }

  const callback = execution.callback;

  // Whether this signal canceled the execution. If the execution was
  // canceled otherwise first, e.g. via `cancel()` or by a request timeout,
  // its error is kept.
  let canceledBySignal = false;

  const onAbort = () => {
    if (!execution.canceled) {
      canceledBySignal = true;
      execution.cancel();
    }
  };

  execution.callback = function(error, ...rest) {
    execution.callback = callback;
    signal.removeEventListener('abort', onAbort);

    if (canceledBySignal && error instanceof RequestError && error.code === 'ECANCEL') {
      error = abortError(signal);
    }

    callback.call(execution, error, ...rest);
  };

  if (signal.aborted) {
    // A canceled request is not sent, and completes asynchronously.
    onAbort();
  } else {
    signal.addEventListener('abort', onAbort, { once: true });
  }
}
