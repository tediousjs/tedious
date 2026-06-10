import { EventEmitter } from 'events';
import StreamParser, { type ParserOptions } from './stream-parser';
import Debug from '../debug';
import { TYPE } from './token';
import rowParser from './row-token-parser';
import nbcRowParser from './nbcrow-token-parser';
import { SequentialRow } from '../sequential-row';
import { TokenHandler } from './handler';

/**
 * Reads tokens from a message and dispatches them to the given handler.
 *
 * Tokens are parsed and dispatched synchronously as long as enough data is
 * buffered - the parsing loop only goes asynchronous when it has to wait for
 * more data, when a slow (streaming) token parser is hit, or when paused.
 */
export class Parser extends EventEmitter {
  declare debug: Debug;
  declare options: ParserOptions;
  declare parser: StreamParser;
  declare handler: TokenHandler;

  declare paused: boolean;
  declare resumeCallback: (() => void) | null;
  declare streamRows: boolean;

  constructor(message: AsyncIterable<Buffer>, debug: Debug, handler: TokenHandler, options: ParserOptions, { streamRows = false }: { streamRows?: boolean } = {}) {
    super();

    this.debug = debug;
    this.options = options;
    this.handler = handler;

    this.paused = false;
    this.resumeCallback = null;
    this.streamRows = streamRows;

    this.parser = new StreamParser(message, debug, options);

    this.run().then(() => {
      this.emit('end');
    }, (err) => {
      this.emit('error', err);
    });
  }

  async run() {
    const parser = this.parser;
    const handler = this.handler;
    const debug = this.debug;

    while (true) {
      // Parse and dispatch as many buffered tokens as possible.
      while (parser.buffer.length >= parser.position + 1) {
        if (this.paused) {
          await new Promise<void>((resolve) => {
            this.resumeCallback = resolve;
          });

          continue;
        }

        const type = parser.buffer.readUInt8(parser.position);
        parser.position += 1;

        // Rows are parsed and dispatched directly, without allocating a
        // token object per row.
        if (type === TYPE.ROW || type === TYPE.NBCROW) {
          if (this.streamRows) {
            // Sequential row mode: the consumer drives the parsing of the
            // row's cells; only continue once the row was fully consumed.
            const row = await SequentialRow.create(parser, type === TYPE.NBCROW);
            handler.onRow(row);
            await row.completion;
            continue;
          }

          let row = type === TYPE.ROW ? rowParser(parser) : nbcRowParser(parser);
          if (row instanceof Promise) {
            row = await row;
          }

          handler.onRow(row);
          continue;
        }

        let token = parser.readToken(type);
        if (token instanceof Promise) {
          token = await token;
        }

        if (token !== undefined) {
          debug.token(token);
          handler[token.handlerName as keyof TokenHandler](token as any);
        }
      }

      // Wait for more data.
      try {
        await parser.waitForChunk();
      } catch (err: unknown) {
        if (parser.position === parser.buffer.length) {
          // All data was consumed - the end of the token stream was reached.
          return;
        }

        throw err;
      }
    }
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

    const resumeCallback = this.resumeCallback;
    if (resumeCallback) {
      this.resumeCallback = null;
      resumeCallback();
    }
  }
}
