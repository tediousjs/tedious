import { EventEmitter } from 'events';
import StreamParser, { NEED_MORE_DATA, type ParserOptions } from './stream-parser';
import Debug from '../debug';
import { TokenHandler } from './handler';

/**
  Parses the tokens of an incoming message and delivers them to a handler.

  The message's data is pulled from an (async) iterable of chunks, e.g. the
  generator returned by `readMessage`. Every chunk is pushed into the token
  parser and all complete tokens are parsed and delivered synchronously,
  before the next chunk is requested. Pausing stops requesting chunks, which
  propagates as backpressure to the underlying stream.

  Emits `start` when the first chunk arrives, `end` once the message has
  been parsed completely, and `error` if reading or parsing fails.
*/
export class Parser extends EventEmitter {
  declare debug: Debug;
  declare options: ParserOptions;
  declare parser: StreamParser;
  declare handler: TokenHandler;

  declare paused: boolean;
  declare resumed: (() => void) | undefined;

  constructor(chunks: AsyncIterable<Buffer> | Iterable<Buffer>, debug: Debug, handler: TokenHandler, options: ParserOptions) {
    super();

    this.debug = debug;
    this.options = options;
    this.handler = handler;
    this.parser = new StreamParser(debug, options);

    this.paused = false;
    this.resumed = undefined;

    this.run(chunks).then(() => {
      this.emit('end');
    }, (err) => {
      this.emit('error', err);
    });
  }

  async run(chunks: AsyncIterable<Buffer> | Iterable<Buffer>) {
    const parser = this.parser;
    const handler = this.handler;
    const debug = this.debug;

    let started = false;

    for await (const chunk of chunks) {
      if (!started) {
        started = true;
        this.emit('start');
      }

      parser.push(chunk);

      while (true) {
        if (this.paused) {
          await this.waitForResume();
        }

        const token = parser.parseNext();
        if (token === NEED_MORE_DATA) {
          break;
        }

        if (token !== undefined) {
          debug.token(token);
          handler[token.handlerName as keyof TokenHandler](token as any);
        }
      }
    }

    if (this.paused) {
      await this.waitForResume();
    }

    if (!parser.isEmpty()) {
      throw new Error('unexpected end of message');
    }
  }

  waitForResume() {
    return new Promise<void>((resolve) => {
      this.resumed = resolve;
    });
  }

  declare on: (
    ((event: 'end', listener: () => void) => this) &
    ((event: string | symbol, listener: (...args: any[]) => void) => this)
  );

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;

    const resumed = this.resumed;
    if (resumed !== undefined) {
      this.resumed = undefined;
      resumed();
    }
  }
}
