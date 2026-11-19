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
 * an execution, be it `cancel()`, its request timeout or the abort signal
 * given in the {@link ExecutionOptions}, aborts this signal, and the first one
 * to do so determines the execution's error. The connection only needs to
 * react to this one signal.
 *
 * A cancellation applies to the current execution, or to the next one if none
 * is in progress. It is reset once the execution completed (see
 * {@link complete}), or once an execution is rejected while none is in
 * progress (see {@link rejected}), so that it does not affect later
 * executions.
 *
 * @private
 */
export class Cancellation {
  /**
   * Aborted to cancel the current execution.
   */
  declare private controller: AbortController;

  /**
   * Called whenever an execution is canceled.
   */
  declare private onCancel: () => void;

  /**
   * Remove the listeners that belong to the current execution.
   */
  declare private removers: Array<() => void>;

  /**
   * Cancels the current execution once its request timeout expired.
   */
  declare private timer: NodeJS.Timeout | undefined;

  /**
   * Whether an execution was accepted and has not completed yet.
   */
  declare executing: boolean;

  constructor(onCancel: () => void) {
    this.controller = new AbortController();
    this.onCancel = onCancel;
    this.removers = [];
    this.timer = undefined;
    this.executing = false;
  }

  /**
   * Aborted once the current execution is canceled, with the error that it
   * completes with as the reason.
   */
  get signal(): AbortSignal {
    return this.controller.signal;
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
   * Start an execution, which was accepted.
   *
   * It is canceled with an abort error once the given signal is aborted, or
   * right away if it is aborted already. Unless it is canceled already, it is
   * canceled with a timeout error once the given request timeout expired,
   * unless that is stopped first (see {@link stopTimeout}). A timeout of `0`
   * means no timeout.
   */
  start(signal: AbortSignal | undefined, timeout: number) {
    this.executing = true;

    if (signal !== undefined) {
      if (signal.aborted) {
        this.cancel(abortError(signal));
      } else {
        this.listen(signal, () => {
          this.cancel(abortError(signal));
        });
      }
    }

    if (timeout && !this.canceled) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.cancel(new RequestError('Timeout: Request failed to complete in ' + timeout + 'ms', 'ETIMEOUT'));
      }, timeout);
    }
  }

  /**
   * Stop the request timeout of the current execution, e.g. because the
   * server started to respond.
   */
  stopTimeout() {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Call the given listener once the current execution is canceled. It is
   * removed once the execution completed.
   */
  onAbort(listener: () => void) {
    this.listen(this.signal, listener);
  }

  /**
   * Complete the current execution: stop its request timeout, remove the
   * listeners that belong to it, and reset the cancellation for the next
   * execution.
   */
  complete() {
    this.executing = false;
    this.stopTimeout();

    for (const remove of this.removers) {
      remove();
    }
    this.removers = [];

    this.reset();
  }

  /**
   * An execution was rejected (or failed before it was accepted). A
   * cancellation that was made for it no longer applies - unless another
   * execution is in progress, which it was made for instead.
   */
  rejected() {
    if (!this.executing) {
      this.reset();
    }
  }

  private reset() {
    // A signal that was not aborted, and whose listeners were removed, can be
    // kept for the next execution.
    if (this.signal.aborted) {
      this.controller = new AbortController();
    }
  }

  private listen(signal: AbortSignal, listener: () => void) {
    signal.addEventListener('abort', listener, { once: true });
    this.removers.push(() => {
      signal.removeEventListener('abort', listener);
    });
  }
}
