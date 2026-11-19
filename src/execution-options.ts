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

/**
 * The cancellation of the executions of a {@link Request} or {@link BulkLoad}.
 *
 * Every execution is canceled through an abort signal, {@link signal}, whose
 * reason is the error the canceled execution completes with. Whatever cancels
 * an execution, be it `cancel()`, a request timeout or the abort signal given
 * in the {@link ExecutionOptions}, aborts this signal, and the first one to do
 * so determines the execution's error. The connection only needs to react to
 * this one signal.
 *
 * A cancellation applies to the current execution, or to the next one if none
 * is in progress. Once an execution completed, the cancellation is reset with
 * {@link complete}, so that it does not affect later executions.
 *
 * @private
 */
export class Cancellation {
  /**
   * Aborted to cancel the current execution.
   */
  declare private controller: AbortController;

  /**
   * Aborted once the current execution completed.
   */
  declare private completedController: AbortController;

  /**
   * Called whenever an execution is canceled.
   */
  declare private onCancel: () => void;

  constructor(onCancel: () => void) {
    this.onCancel = onCancel;
    this.reset();
  }

  /**
   * Aborted once the current execution is canceled, with the error that it
   * completes with as the reason.
   */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /**
   * Aborted once the current execution completed.
   *
   * Listeners that belong to the current execution are registered with this
   * signal (as the `signal` option of `addEventListener`), so that they are
   * removed once it completed, however it completed.
   */
  get completed(): AbortSignal {
    return this.completedController.signal;
  }

  /**
   * Whether the current execution was canceled.
   */
  get canceled(): boolean {
    return this.signal.aborted;
  }

  /**
   * The error the current execution completes with, if it was canceled.
   */
  get error(): Error | undefined {
    return this.signal.aborted ? this.signal.reason : undefined;
  }

  /**
   * Cancel the current execution, which then completes with the given error,
   * unless it was canceled already.
   */
  cancel(error: Error) {
    if (this.canceled) {
      return;
    }

    this.controller.abort(error);
    this.onCancel();
  }

  /**
   * Cancel the current execution with an abort error once the given signal
   * is aborted, or right away if it is aborted already.
   *
   * The signal is only listened to until the current execution completed.
   */
  follow(signal: AbortSignal) {
    if (signal.aborted) {
      this.cancel(abortError(signal));
      return;
    }

    signal.addEventListener('abort', () => {
      this.cancel(abortError(signal));
    }, { once: true, signal: this.completed });
  }

  /**
   * Complete the current execution: remove the listeners that belong to it,
   * and reset the cancellation for the next execution.
   */
  complete() {
    this.completedController.abort();
    this.reset();
  }

  private reset() {
    this.controller = new AbortController();
    this.completedController = new AbortController();
  }
}
