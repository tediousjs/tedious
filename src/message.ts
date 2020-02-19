import { PassThrough } from 'readable-stream';

class Message extends PassThrough {
  type: number;
  resetConnection: boolean;
  ignore: boolean;

  constructor({ type, resetConnection = false }: { type: number, resetConnection?: boolean }) {
    super();

    this.type = type;
    this.resetConnection = resetConnection;
    this.ignore = false;
  }
}

export default Message;
module.exports = Message;
