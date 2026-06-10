import { type ColumnMetadata } from './colmetadata-token-parser';
import { type ParserOptions } from './stream-parser';

export interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

/**
 * The per-column lookup used to build name-keyed rows when `useColumnNames`
 * is enabled. Computed once per result set: for duplicated column names, the
 * first column wins.
 */
const nameLookupCache = new WeakMap<ColumnMetadata[], Array<[string, number]>>();

function getNameLookup(colMetadata: ColumnMetadata[]): Array<[string, number]> {
  let lookup = nameLookupCache.get(colMetadata);

  if (lookup === undefined) {
    lookup = [];

    const seen = new Set<string>();
    for (let i = 0; i < colMetadata.length; i++) {
      const colName = colMetadata[i].colName;
      if (!seen.has(colName)) {
        seen.add(colName);
        lookup.push([colName, i]);
      }
    }

    nameLookupCache.set(colMetadata, lookup);
  }

  return lookup;
}

/**
 * Builds a row in the shape determined by the `rowFormat` and
 * `useColumnNames` options from the parsed column values.
 *
 * - `rowFormat: 'values'`: the values array itself, or an object mapping
 *   column names to values.
 * - `rowFormat: 'columns'` (default): an array of `{ value, metadata }`
 *   column objects, or an object mapping column names to such objects.
 */
export function buildRow(colMetadata: ColumnMetadata[], values: unknown[], options: ParserOptions): unknown {
  if (options.rowFormat === 'values') {
    if (options.useColumnNames) {
      const row: { [colName: string]: unknown } = Object.create(null);

      for (const [colName, i] of getNameLookup(colMetadata)) {
        row[colName] = values[i];
      }

      return row;
    }

    return values;
  }

  if (options.useColumnNames) {
    const row: { [colName: string]: Column } = Object.create(null);

    for (const [colName, i] of getNameLookup(colMetadata)) {
      row[colName] = { value: values[i], metadata: colMetadata[i] };
    }

    return row;
  }

  const row: Column[] = [];
  for (let i = 0; i < values.length; i++) {
    row.push({ value: values[i], metadata: colMetadata[i] });
  }

  return row;
}
