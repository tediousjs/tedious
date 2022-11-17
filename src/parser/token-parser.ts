import { FlatMap, UInt8 } from '.';
import { Token } from '../token/token';
import { DoneProcTokenParser } from '../token/done-token-parser';
import { EnvChangeTokenParser } from './tokens/env-change-token';

function selectTokenParser(options: { tdsVersion: string }, type: number) {
  switch (type) {
    case 0xFE:
      return new DoneProcTokenParser(options);

    case 0xE3:
      return new EnvChangeTokenParser();

    default:
      throw new Error('unreachable');
  }
}

/**
 * Parse a single token.
 */
export class TokenParser extends FlatMap<number, Token> {
  constructor(options: { tdsVersion: string }) {
    super(new UInt8(), (type) => { return selectTokenParser(options, type); });
  }
}
