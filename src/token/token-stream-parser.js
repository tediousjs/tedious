'use strict';

const EventEmitter = require('events').EventEmitter;
const StreamParser = require('./stream-parser');

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
class Parser extends EventEmitter {
  constructor(debug, colMetadata, options) {
    super();

    this.debug = debug;
    this.colMetadata = this.colMetadata;
    this.options = options;

    this.parser = new StreamParser(this.debug, this.colMetadata, this.options);
    this.parser.on('data', (token) => {
      if (token.event) {
        this.emit(token.event, token);
      }
    });
  }

  addBuffer(buffer) {
    return this.parser.write(buffer);
  }

  isEnd() {
    return this.parser.buffer.length === this.parser.position;
  }
}
module.exports.Parser = Parser;
