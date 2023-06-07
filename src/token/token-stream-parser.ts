import { EventEmitter } from 'events';
import StreamParser, { ParserOptions } from './stream-parser';
import Debug from '../debug';
import { Token } from './token';
import { Readable } from 'stream';
import Message from '../message';
import { TokenHandler } from './handler';

export class Parser extends EventEmitter {
  debug: Debug;
  options: ParserOptions;
  parser: Readable;

  constructor(message: Message, debug: Debug, handler: TokenHandler, options: ParserOptions) {
    super();

    this.debug = debug;
    this.options = options;

    this.parser = Readable.from(StreamParser.parseTokens(message, this.debug, this.options));
    this.parser.on('data', (token: Token) => {
      handler[token.handlerName as keyof TokenHandler](token as any);
    });

    this.parser.on('drain', () => {
      this.emit('drain');
    });

    this.parser.on('end', () => {
      this.emit('end');
    });
  }

  declare on: (
    ((event: 'end', listener: () => void) => this) &
    ((event: string | symbol, listener: (...args: any[]) => void) => this)
  );

  pause() {
    return this.parser.pause();
  }

  resume() {
    return this.parser.resume();
  }
}
