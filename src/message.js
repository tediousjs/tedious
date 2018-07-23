// @flow

const { PassThrough } = require('readable-stream');

class Message extends PassThrough {
  type: number;
  resetConnection: boolean;

  constructor({ type, resetConnection = false } : { type: number, resetConnection?: boolean }) {
    super();

    this.type = type;
    this.resetConnection = resetConnection;
  }
}

module.exports = Message;
