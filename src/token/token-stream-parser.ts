import { EventEmitter } from 'events';
import StreamParser, { type ParserOptions } from './stream-parser';
import Debug from '../debug';
import Message from '../message';
import { TokenHandler } from './handler';

/**
 * Parses the tokens of a message and dispatches them to a `TokenHandler`.
 *
 * Emits `'end'` once all tokens were handled, or `'error'` if parsing or
 * handling a token failed.
 */
export class Parser extends EventEmitter {
  declare debug: Debug;
  declare options: ParserOptions;

  declare paused: boolean;
  declare onResume: (() => void) | undefined;

  constructor(message: Message | Iterable<Buffer>, debug: Debug, handler: TokenHandler, options: ParserOptions) {
    super();

    this.debug = debug;
    this.options = options;

    this.paused = false;
    this.onResume = undefined;

    // Emit outside of the promise chain, so an exception thrown by a listener
    // is an uncaught exception (like on master), not an unhandled rejection.
    this.run(message, handler).then(() => {
      process.nextTick(() => this.emit('end'));
    }, (error: Error) => {
      process.nextTick(() => this.emit('error', error));
    });
  }

  async run(message: Message | Iterable<Buffer>, handler: TokenHandler) {
    const parser = new StreamParser(this.options);

    // Iterate manually - unlike `for await`, this does not destroy the message
    // if parsing fails.
    const iterator: AsyncIterator<Buffer> | Iterator<Buffer> = Symbol.asyncIterator in message ? message[Symbol.asyncIterator]() : message[Symbol.iterator]();

    let result;
    while (!(result = await iterator.next()).done) {
      parser.write(result.value);

      while (true) {
        while (this.paused) {
          await new Promise<void>((resolve) => {
            this.onResume = resolve;
          });
        }

        const token = parser.read();
        if (token === undefined) {
          break;
        }

        this.debug.token(token);
        handler[token.handlerName](token as any);
      }
    }

    parser.end();
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

    const onResume = this.onResume;
    this.onResume = undefined;
    onResume?.();
  }
}
