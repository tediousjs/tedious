import { assert } from 'chai';

/**
 * `assert.instanceOf` from `chai`, but with type narrowing for the given `value`.
 */
export function assertInstanceOf<T, F extends abstract new(...args: any) => any>(value: T, constructor: F, message?: string): asserts value is InstanceType<F> {
  assert.instanceOf(value, constructor, message);
}
