import type { Temporal } from 'temporal-polyfill';

// The type of the `Temporal` namespace object itself (its constructors), as
// opposed to `Temporal.*` which refers to the instance/type members.
type TemporalImpl = typeof import('temporal-polyfill').Temporal;

// `temporal-polyfill` is published as an ESM-only package, but tedious is
// compiled down to CommonJS. A static `import` would be rewritten to a
// `require()` call that the package's `exports` map rejects, so we load it
// through a genuine dynamic `import()`. Wrapping it in `new Function` prevents
// Babel from transpiling the `import()` into an interop `require()`.
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

export type { Temporal };

let cached: TemporalImpl | undefined;

/**
 * Load the `Temporal` implementation, preferring a native `globalThis.Temporal`
 * when the runtime provides one and falling back to `temporal-polyfill`.
 *
 * This must be awaited once (e.g. during connection setup) before any value is
 * parsed or encoded, because those code paths are synchronous and rely on the
 * cached implementation returned by {@link getTemporal}.
 */
export async function loadTemporal(): Promise<TemporalImpl> {
  if (cached) {
    return cached;
  }

  const native = (globalThis as any).Temporal as TemporalImpl | undefined;
  if (native) {
    cached = native;
    return cached;
  }

  const mod = await nativeImport('temporal-polyfill');
  cached = mod.Temporal;
  return cached!;
}

/**
 * Return the `Temporal` implementation loaded by {@link loadTemporal}.
 *
 * Throws if {@link loadTemporal} has not completed yet.
 */
export function getTemporal(): TemporalImpl {
  if (!cached) {
    throw new Error('Temporal implementation has not been loaded yet. Ensure the connection has been established before parsing or encoding date/time values.');
  }

  return cached;
}
