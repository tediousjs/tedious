/**
 * Whether `value` is a thenable: a promise, or anything else with a
 * `then` method that `await` would assimilate.
 */
export function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return value != null && typeof (value as PromiseLike<T>).then === 'function';
}

/**
 * For a rejection that has nowhere to go: the failure it reports is one
 * the bulk load has already failed for, or one of a source being let go
 * of.
 */
export function ignoreError() {}
