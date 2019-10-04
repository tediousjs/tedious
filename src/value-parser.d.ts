import Parser from './token/stream-parser';
import { Metadata } from './metadata-parser';
import { InternalConnectionOptions } from './connection';

declare function valueParse(parser: Parser, metadata: Metadata, options: InternalConnectionOptions, callback: (value: unknown) => void): void;

export default valueParse;
