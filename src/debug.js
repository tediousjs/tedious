'use strict';

const EventEmitter = require('events').EventEmitter;
const util = require('util');

module.exports = class Debug extends EventEmitter {
  /*
    @options    Which debug details should be sent.
                data    - dump of packet data
                payload - details of decoded payload
  */
  constructor(options) {
    super();

    this.options = options;
    this.options = this.options || {};
    this.options.data = this.options.data || false;
    this.options.payload = this.options.payload || false;
    this.options.packet = this.options.packet || false;
    this.options.token = this.options.token || false;
    this.indent = '  ';
  }

  packet(direction, packet) {
    if (this.haveListeners() && this.options.packet) {
      this.log('');
      this.log(direction);
      this.log(packet.headerToString(this.indent));
    }
  }

  data(packet) {
    if (this.haveListeners() && this.options.data) {
      this.log(packet.dataToString(this.indent));
    }
  }

  payload(generatePayloadText) {
    if (this.haveListeners() && this.options.payload) {
      this.log(generatePayloadText());
    }
  }

  token(token) {
    if (this.haveListeners() && this.options.token) {
      this.log(util.inspect(token, false, 5, true));
    }
  }

  haveListeners() {
    return this.listeners('debug').length > 0;
  }

  log(text) {
    this.emit('debug', text);
  }
};
