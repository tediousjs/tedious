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
   *
   * If the execution failed or was canceled otherwise before the signal was
   * aborted, e.g. via `cancel()` or by a request timeout, it completes with
   * that error instead. If the server does not acknowledge the cancellation
   * within {@link ConnectionOptions.cancelTimeout}, the connection is closed
   * and the execution fails with that connection error.
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
 * The callbacks that {@link abortOnSignal} replaced, by the callback it
 * replaced them with.
 *
 * @private
 */
const replacedCallbacks = new WeakMap<Execution['callback'], Execution['callback']>();

/**
 * The given request's or bulk load's callback, without the replacements
 * {@link abortOnSignal} made for the executions that are in progress.
 *
 * An execution that is rejected while another execution of the same request
 * or bulk load is in progress must call back with this callback. Otherwise,
 * its completion would be taken for the completion of the execution in
 * progress, whose signal would no longer be listened to.
 *
 * @private
 */
export function originalCallback(execution: Execution): Execution['callback'] {
  let callback = execution.callback;
  for (let replaced = replacedCallbacks.get(callback); replaced !== undefined; replaced = replacedCallbacks.get(callback)) {
    callback = replaced;
  }
  return callback;
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

  replacedCallbacks.set(execution.callback, callback);

  if (signal.aborted) {
    // A canceled request is not sent, and completes asynchronously.
    onAbort();
  } else {
    signal.addEventListener('abort', onAbort, { once: true });
  }
}
