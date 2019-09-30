import { EventEmitter } from 'events';
import StreamParser from './stream-parser';
import Debug from '../debug';
import { InternalConnectionOptions } from '../connection';
import { Token } from './token';

/*
  Buffers are thrown at the parser (by calling addBuffer).
  Tokens are parsed from the buffer until there are no more tokens in
  the buffer, or there is just a partial token left.
  If there is a partial token left over, then it is kept until another
  buffer is added, which should contain the remainder of the partial
  token, along with (perhaps) more tokens.
  The partial token and the new buffer are concatenated, and the token
  parsing resumes.
 */
export class Parser extends EventEmitter {
  debug: Debug;
  colMetadata: any;
  options: InternalConnectionOptions;
  parser: StreamParser;

  constructor(debug: Debug, colMetadata: any, options: InternalConnectionOptions) {
    super();

    this.debug = debug;
    this.colMetadata = colMetadata;
    this.options = options;

    this.parser = new StreamParser(this.debug, this.colMetadata, this.options);
    this.parser.on('data', (token: Token) => {
      if (token.event) {
        this.emit(token.event, token);
      }
    });
    this.parser.on('drain', () => {
      this.emit('drain');
    });
  }

  // Returns false to apply backpressure.
  addBuffer(buffer: Buffer) {
    return this.parser.write(buffer);
  }

  // Writes an end-of-message (EOM) marker into the parser transform input
  // queue. StreamParser will emit a 'data' event with an 'endOfMessage'
  // pseudo token when the EOM marker has passed through the transform stream.
  // Returns false to apply backpressure.
  addEndOfMessageMarker() {
    return this.parser.write(this.parser.endOfMessageMarker);
  }

  isEnd() {
    return this.parser.buffer.length === this.parser.position;
  }

  // Temporarily suspends the token stream parser transform from emitting events.
  pause() {
    this.parser.pause();
  }

  // Resumes the token stream parser transform.
  resume() {
    this.parser.resume();
  }
}
