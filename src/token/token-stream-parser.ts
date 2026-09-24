import { EventEmitter } from 'events';
import StreamParser, { NEED_MORE_DATA, type ParserOptions } from './stream-parser';
import Debug from '../debug';
import IncomingMessage, { type MessageSink } from '../incoming-message';
import { TokenHandler } from './handler';

/**
  Parses the tokens of an incoming message and delivers them to a handler.

  The parser attaches itself to the message as a sink, so that it receives
  the message's data synchronously as it arrives, and parses and delivers
  all complete tokens right away. Delivery can be paused, in which case the
  remaining data is held back (and, via backpressure, no longer read from
  the socket) until the parser is resumed.
*/
export class Parser extends EventEmitter implements MessageSink {
  declare debug: Debug;
  declare options: ParserOptions;
  declare parser: StreamParser;
  declare handler: TokenHandler;

  declare paused: boolean;
  declare ended: boolean;
  declare failed: boolean;
  declare message: IncomingMessage | undefined;

  constructor(message: IncomingMessage | Iterable<Buffer>, debug: Debug, handler: TokenHandler, options: ParserOptions) {
    super();

    this.debug = debug;
    this.options = options;
    this.handler = handler;
    this.parser = new StreamParser(debug, options);

    this.paused = false;
    this.ended = false;
    this.failed = false;
    this.message = undefined;

    // Attach in a microtask so that the caller can register its listeners
    // before any token (or the end of the message) is delivered.
    if (message instanceof IncomingMessage) {
      this.message = message;
      queueMicrotask(() => {
        message.attach(this);
      });
    } else {
      // A plain sequence of chunks (used by tests).
      queueMicrotask(() => {
        for (const chunk of message) {
          if (!this.push(chunk)) {
            throw new Error('Parsing a plain sequence of chunks cannot be paused');
          }
        }
        this.end();
      });
    }
  }

  push(data: Buffer): boolean {
    if (this.failed) {
      return true;
    }

    this.parser.push(data);
    return this.drain();
  }

  end() {
    if (this.failed) {
      return;
    }

    this.ended = true;

    if (this.paused) {
      // The end of the message is delivered once the parser is resumed
      // and all buffered data has been parsed.
      return;
    }

    this.finish();
  }

  /**
   * Parses and delivers all complete tokens from the buffered data.
   * Returns `false` if delivery was paused before all data was consumed.
   */
  drain(): boolean {
    const parser = this.parser;
    const handler = this.handler;
    const debug = this.debug;

    while (!this.paused) {
      let token;
      try {
        token = parser.parseNext();
      } catch (err) {
        this.fail(err as Error);
        return true;
      }

      if (token === NEED_MORE_DATA) {
        return true;
      }

      if (token !== undefined) {
        debug.token(token);
        handler[token.handlerName as keyof TokenHandler](token as any);
      }
    }

    return false;
  }

  finish() {
    if (!this.parser.isEmpty()) {
      this.fail(new Error('unexpected end of message'));
      return;
    }

    this.emit('end');
  }

  fail(err: Error) {
    this.failed = true;
    this.emit('error', err);
  }

  declare on: (
    ((event: 'end', listener: () => void) => this) &
    ((event: string | symbol, listener: (...args: any[]) => void) => this)
  );

  pause() {
    this.paused = true;
  }

  resume() {
    if (!this.paused) {
      return;
    }

    this.paused = false;

    if (!this.drain()) {
      // Paused again while delivering the buffered tokens.
      return;
    }

    if (this.ended) {
      this.finish();
      return;
    }

    if (this.message !== undefined) {
      this.message.continueSink();
    }
  }
}
