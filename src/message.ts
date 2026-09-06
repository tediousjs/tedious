import { PassThrough } from 'stream';

class Message extends PassThrough {
  declare type: number;
  declare resetConnection: boolean;
  declare ignore: boolean;

  constructor({ type, resetConnection = false }: { type: number, resetConnection?: boolean | undefined }) {
    super();

    this.type = type;
    this.resetConnection = resetConnection;
    this.ignore = false;
  }
}

export default Message;
module.exports = Message;
