// @flow

const { PassThrough } = require('stream');

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
