import TimeoutError from '../errors/timeout-error';

/**
 * Run the function `func` with an `AbortSignal` that will automatically abort after the time specified
 * by `timeout` or when the given `signal` is aborted.
 *
 * On timeout, the `timeoutSignal` will be aborted and a `TimeoutError` will be thrown.
 */
export async function withTimeout<T>(timeout: number, func: (timeoutSignal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const timeoutController = new AbortController();
  const abortCurrentAttempt = () => { timeoutController.abort(); };

  const timer = setTimeout(abortCurrentAttempt, timeout);
  signal?.addEventListener('abort', abortCurrentAttempt, { once: true });

  try {
    return await func(timeoutController.signal);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError' && !(signal && signal.aborted)) {
      throw new TimeoutError();
    }

    throw err;
  } finally {
    signal?.removeEventListener('abort', abortCurrentAttempt);
    clearTimeout(timer);
  }
}
