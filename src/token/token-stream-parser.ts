import { EventEmitter } from 'events';
import StreamParser from './stream-parser';
import Debug from '../debug';

import {
  ColMetadataToken,
  EnvChangeToken,
  DoneToken,
  DoneInProcToken,
  DoneProcToken,
  InfoToken,
  ErrorToken,
  FeatureExtAckToken,
  FedAuthInfoToken,
  LoginAckToken,
  NBCRowToken,
  OrderToken,
  ReturnStatusToken,
  ReturnValueToken,
  RowToken,
  SSPIToken,
  EOMToken,
  Column
} from './stream-parser';

import { InternalConnectionOptions } from '../connection';

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
  colMetadata?: Column[];
  parser: StreamParser;
  options: InternalConnectionOptions;

  on!: (
    ((event: 'columnMetadata', listener: (token: ColMetadataToken) => void) => this) &
    ((event: 'resetConnection', listener: (token: EnvChangeToken) => void) => this) &
    ((event: 'routingChange', listener: (token: EnvChangeToken) => void) => this) &
    ((event: 'packetSizeChange', listener: (token: EnvChangeToken) => void) => this) &
    ((event: 'beginTransaction', listener: (token: EnvChangeToken) => void) => this) &
    ((event: 'commitTransaction', listener: (token: EnvChangeToken) => void) => this) &
    ((event: 'rollbackTransaction', listener: (token: EnvChangeToken) => void) => this) &
    ((event: 'charsetChange', listener: (token: EnvChangeToken) => void) => this) &
    ((event: 'languageChange', listener: (token: EnvChangeToken) => void) => this) &
    ((event: 'databaseChange', listener: (token: EnvChangeToken) => void) => this) &
    ((event: 'done', listener: (token: DoneToken) => void) => this) &
    ((event: 'doneInProc', listener: (token: DoneInProcToken) => void) => this) &
    ((event: 'doneProc', listener: (token: DoneProcToken) => void) => this) &
    ((event: 'infoMessage', listener: (token: InfoToken) => void) => this) &
    ((event: 'errorMessage', listener: (token: ErrorToken) => void) => this) &
    ((event: 'featureExtAck', listener: (token: FeatureExtAckToken) => void) => this) &
    ((event: 'fedAuthInfo', listener: (token: FedAuthInfoToken) => void) => this) &
    ((event: 'loginack', listener: (token: LoginAckToken) => void) => this) &
    ((event: 'order', listener: (token: OrderToken) => void) => this) &
    ((event: 'returnStatus', listener: (token: ReturnStatusToken) => void) => this) &
    ((event: 'returnValue', listener: (token: ReturnValueToken) => void) => this) &
    ((event: 'sspichallenge', listener: (token: SSPIToken) => void) => this) &
    ((event: 'endOfMessage', listener: (token: EOMToken) => void) => this) &
    ((event: 'row', listener: (token: RowToken | NBCRowToken) => void) => this) &
    ((event: 'tokenStreamError', listener: (error: Error) => void) => this) &
    ((event: 'drain', listener: () => void) => this)
  );

  constructor(debug: Debug, colMetadata: Column[] | undefined, options: InternalConnectionOptions) {
    super();

    this.debug = debug;
    this.colMetadata = colMetadata;
    this.options = options;

    this.parser = new StreamParser(this.debug, this.colMetadata, this.options);
    this.parser.on('data', (token) => {
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
