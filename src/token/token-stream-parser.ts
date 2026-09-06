import { EventEmitter } from 'events';
import StreamParser, { type ParserOptions } from './stream-parser';
import Debug from '../debug';
import { Token } from './token';
import { Readable } from 'stream';
import Message from '../message';
import { TokenHandler } from './handler';

/**
  Buffers and parses tokens from a TDS message, delivering each token to
  the given handler.

  A message that arrived complete in a single packet is parsed synchronously
  and its tokens are delivered to the handler directly. Everything else is
  parsed incrementally as the message is read from its stream.
*/
export class Parser extends EventEmitter {
  declare debug: Debug;
  declare options: ParserOptions;
  declare parser: Readable | undefined;

  declare paused: boolean;
  declare continueSync: (() => void) | undefined;

  constructor(message: Message, debug: Debug, handler: TokenHandler, options: ParserOptions) {
    super();

    this.debug = debug;
    this.options = options;
    this.paused = false;
    this.continueSync = undefined;

    const completeData = message.completeData;
    if (completeData !== undefined) {
      this.parser = undefined;

      // Defer parsing so that the caller can attach its listeners first.
      queueMicrotask(() => {
        this.parseComplete(message, completeData, handler);
      });

      return;
    }

    this.parser = Readable.from(StreamParser.parseTokens(message, this.debug, this.options));

    this.parser.on('data', (token: Token) => {
      debug.token(token);
      handler[token.handlerName as keyof TokenHandler](token as any);
    });

    this.parser.on('drain', () => {
      this.emit('drain');
    });

    this.parser.on('end', () => {
      this.emit('end');
    });

    this.parser.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  /**
   * Parses a message whose data is completely available, delivering tokens
   * to the handler synchronously. Individual tokens that can only be parsed
   * asynchronously are awaited, after which parsing continues.
   */
  parseComplete(message: Message, data: Buffer, handler: TokenHandler) {
    const parser = new StreamParser([], this.debug, this.options);
    parser.buffer = data;
    parser.position = 0;
    parser.complete = true;

    const deliver = (token: Token) => {
      this.debug.token(token);
      handler[token.handlerName as keyof TokenHandler](token as any);
    };

    const step = () => {
      try {
        while (parser.position < parser.buffer.length) {
          if (this.paused) {
            this.continueSync = step;
            return;
          }

          const type = parser.buffer.readUInt8(parser.position);
          parser.position += 1;

          const token = parser.readToken(type);
          if (token instanceof Promise) {
            token.then((token) => {
              if (token !== undefined) {
                deliver(token);
              }

              step();
            }, (err) => {
              this.emit('error', err);
            });

            return;
          }

          if (token !== undefined) {
            deliver(token);
          }
        }
      } catch (err) {
        this.emit('error', err);
        return;
      }

      // Let the message stream end, so that the next message can be
      // processed.
      message.resume();

      this.emit('end');
    };

    step();
  }

  declare on: (
    ((event: 'end', listener: () => void) => this) &
    ((event: string | symbol, listener: (...args: any[]) => void) => this)
  );

  pause() {
    this.paused = true;

    if (this.parser) {
      this.parser.pause();
    }
  }

  resume() {
    this.paused = false;

    if (this.parser) {
      this.parser.resume();
      return;
    }

    const continueSync = this.continueSync;
    if (continueSync) {
      this.continueSync = undefined;
      continueSync();
    }
  }
}
