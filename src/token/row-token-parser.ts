// s2.2.7.17

import Parser from './stream-parser';
import { type ColumnMetadata } from './colmetadata-token-parser';

import { RowToken } from './token';
import * as iconv from 'iconv-lite';

import { isPLPStream, readPLPStream, readValue, type PLPState } from '../value-parser';
import { type Metadata } from '../metadata-parser';

export interface Column {
  value: unknown;
  metadata: ColumnMetadata;
}

/**
 * The progress of a partially parsed row or NBC row token.
 */
export interface RowState {
  kind: 'row';
  columns: Column[];
  /**
   * The index of the next column to parse.
   */
  index: number;
  /**
   * The progress of the PLP value of column `index`, if any.
   */
  plp: PLPState | undefined;
  /**
   * The null bitmap of an NBC row.
   */
  bitmap: Buffer | undefined;
}

export function plpValue(chunks: null | Buffer[], metadata: Metadata): unknown {
  if (chunks === null) {
    return null;
  } else if (metadata.type.name === 'NVarChar' || metadata.type.name === 'Xml') {
    return Buffer.concat(chunks).toString('ucs2');
  } else if (metadata.type.name === 'VarChar') {
    return iconv.decode(Buffer.concat(chunks), metadata.collation?.codepage ?? 'utf8');
  } else if (metadata.type.name === 'VarBinary' || metadata.type.name === 'UDT') {
    return Buffer.concat(chunks);
  }
}

export function rowState(parser: Parser): RowState {
  const state = parser.tokenState;
  if (state !== undefined && state.kind === 'row') {
    return state;
  }

  const newState: RowState = {
    kind: 'row',
    columns: new Array(parser.colMetadata.length),
    index: 0,
    plp: undefined,
    bitmap: undefined
  };
  parser.tokenState = newState;
  return newState;
}

/**
 * Reads the value of the column at `state.index` and commits the parser's
 * position past it.
 */
export function readColumn(parser: Parser, state: RowState, metadata: ColumnMetadata) {
  let value;
  if (isPLPStream(metadata)) {
    value = plpValue(readPLPStream(parser, state), metadata);
  } else {
    const result = readValue(parser.buffer, parser.position, metadata, parser.options);
    parser.position = result.offset;
    value = result.value;
  }

  state.columns[state.index] = { value, metadata };
  state.index += 1;
  parser.commit();
}

export function columnsToToken<T>(parser: Parser, columns: Column[], construct: (columns: Column[] | { [key: string]: Column }) => T): T {
  if (parser.options.useColumnNames) {
    const columnsMap: { [key: string]: Column } = Object.create(null);

    for (const column of columns) {
      const colName = column.metadata.colName;
      if (columnsMap[colName] == null) {
        columnsMap[colName] = column;
      }
    }

    return construct(columnsMap);
  } else {
    return construct(columns);
  }
}

/**
 * Parses a row token. Resumable: if the buffered data runs out, the
 * columns parsed so far are kept on the parser and parsing continues with
 * the next column once more data is available.
 */
function rowParser(parser: Parser): RowToken {
  const colMetadata = parser.colMetadata;
  const state = rowState(parser);

  while (state.index < colMetadata.length) {
    readColumn(parser, state, colMetadata[state.index]);
  }

  parser.tokenState = undefined;
  return columnsToToken(parser, state.columns, (columns) => new RowToken(columns));
}

export default rowParser;
module.exports = rowParser;
module.exports.plpValue = plpValue;
module.exports.rowState = rowState;
module.exports.readColumn = readColumn;
module.exports.columnsToToken = columnsToToken;
