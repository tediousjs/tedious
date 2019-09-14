// s2.2.7.16
import Parser from './stream-parser';
import { ColumnMetadata } from './colmetadata-token-parser'
import { ConnectionOptions } from '../connection';

import { ReturnStatusToken } from './token';

function returnStatusParser(parser: Parser, _colMetadata: ColumnMetadata[], _options: ConnectionOptions, callback: (token: ReturnStatusToken) => void) {
  parser.readInt32LE((value) => {
    callback(new ReturnStatusToken(value));
  });
}

export default returnStatusParser;
module.exports = returnStatusParser;
