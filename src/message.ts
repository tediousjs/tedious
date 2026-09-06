import { PassThrough } from 'stream';

class Message extends PassThrough {
  declare type: number;
  declare resetConnection: boolean;
  declare ignore: boolean;

  /**
   * For incoming messages that arrived complete in a single packet, the
   * message's entire data. Allows consumers to process the message
   * synchronously instead of reading it from the stream.
   */
  declare completeData: Buffer | undefined;

  constructor({ type, resetConnection = false }: { type: number, resetConnection?: boolean | undefined }) {
    super();

    this.type = type;
    this.resetConnection = resetConnection;
    this.ignore = false;
    this.completeData = undefined;
  }
}

export default Message;
module.exports = Message;
