import { RequestError } from './errors';

/**
 * Options of a single execution of a [[Request]] or [[BulkLoad]].
 */
export interface ExecutionOptions {
  /**
   * Cancels the execution when aborted. The execution then completes with
   * the signal's `reason` as its error, instead of a cancellation error.
   *
   * If the signal is aborted already, the request is not sent at all.
   */
  signal?: AbortSignal | undefined;
}

/**
 * A request or bulk load, as far as its cancellation is concerned.
 */
interface Execution {
  callback: (error: Error | null | undefined, ...rest: any[]) => void;
  cancel(): void;
}

/**
 * Cancel the current execution of the given request or bulk load once the
 * signal is aborted, and let it complete with the signal's reason instead
 * of the cancellation error.
 *
 * The execution's `callback` is replaced until the execution completed.
 */
export function abortOnSignal(execution: Execution, signal: AbortSignal | undefined) {
  if (signal === undefined) {
    return;
  }

  const callback = execution.callback;

  const onAbort = () => {
    execution.cancel();
  };

  execution.callback = function(error, ...rest) {
    execution.callback = callback;
    signal.removeEventListener('abort', onAbort);

    if (signal.aborted && error instanceof RequestError && error.code === 'ECANCEL') {
      error = signal.reason;
    }

    callback.call(execution, error, ...rest);
  };

  if (signal.aborted) {
    // A canceled request is not sent, and completes asynchronously.
    execution.cancel();
  } else {
    signal.addEventListener('abort', onAbort, { once: true });
  }
}
