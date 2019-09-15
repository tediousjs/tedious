import Parser from './token/stream-parser';
import { Metadata } from './metadata-parser';
import { ConnectionOptions } from './connection';

declare function valueParse(parser: Parser, metadata: Metadata, options: ConnectionOptions, callback: (value: unknown) => void): void;

export default valueParse;
