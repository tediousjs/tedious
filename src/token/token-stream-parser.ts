import { EventEmitter } from 'events';
import StreamParser, { type ParserOptions } from './stream-parser';
import Debug from '../debug';
import Message from '../message';
import { TokenHandler } from './handler';

export class Parser extends EventEmitter {
  declare debug: Debug;
  declare options: ParserOptions;

  // Set while the consumer has paused us; holds the callback that lets the
  // token loop continue once it resumes.
  #paused: boolean;
  #continue: (() => void) | undefined;

  constructor(message: Message, debug: Debug, handler: TokenHandler, options: ParserOptions) {
    super();

    this.debug = debug;
    this.options = options;
    this.#paused = false;
    this.#continue = undefined;

    // Consume the token stream directly instead of wrapping it in a
    // `Readable`. Every token used to travel through an object mode stream -
    // a `push()`, a buffer, a `read()` and a `data` event each - just to be
    // handed to a handler that is known up front.
    //
    // Iteration starts on the microtask queue, exactly as it did when
    // `Readable.from()` started flowing, so callers still get to attach their
    // `end` listener after constructing the parser.
    this.#run(message, handler);
  }

  async #run(message: Message, handler: TokenHandler) {
    try {
      await StreamParser.parseAll(message, this.debug, this.options, (token) => {
        this.debug.token(token);
        handler[token.handlerName as keyof TokenHandler](token as any);

        if (this.#paused) {
          return new Promise<void>((resolve) => {
            this.#continue = resolve;
          });
        }
      });
    } catch (err: unknown) {
      // Emitting on the next tick keeps an unhandled parse error an uncaught
      // exception, which is what it was when the error came out of the
      // `Readable`, rather than turning it into an unhandled rejection.
      process.nextTick(() => {
        this.emit('error', err);
      });

      return;
    }

    this.emit('end');
  }

  declare on: (
    ((event: 'end', listener: () => void) => this) &
    ((event: 'error', listener: (err: Error) => void) => this) &
    ((event: string | symbol, listener: (...args: any[]) => void) => this)
  );

  pause() {
    this.#paused = true;

    return true;
  }

  resume() {
    this.#paused = false;

    const cont = this.#continue;
    if (cont !== undefined) {
      this.#continue = undefined;
      cont();
    }

    return true;
  }
}
