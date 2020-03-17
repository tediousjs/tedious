import { EventEmitter } from 'events';
import * as util from 'util';
import { Packet } from './packet';

class Debug extends EventEmitter {
  options: {
    data: boolean;
    payload: boolean;
    packet: boolean;
    token: boolean;
  };

  indent: string;

  /*
    @options    Which debug details should be sent.
                data    - dump of packet data
                payload - details of decoded payload
  */
  constructor({ data = false, payload = false, packet = false, token = false } = {}) {
    super();

    this.options = { data, payload, packet, token };
    this.indent = '  ';
  }

  packet(direction: 'Received' | 'Sent', packet: Packet) {
    if (this.haveListeners() && this.options.packet) {
      this.log('');
      this.log(direction);
      this.log(packet.headerToString(this.indent));
    }
  }

  data(packet: Packet) {
    if (this.haveListeners() && this.options.data) {
      this.log(packet.dataToString(this.indent));
    }
  }

  payload(generatePayloadText: () => string) {
    if (this.haveListeners() && this.options.payload) {
      this.log(generatePayloadText());
    }
  }

  token(token: any) {
    if (this.haveListeners() && this.options.token) {
      this.log(util.inspect(token, { showHidden: false, depth: 5, colors: true }));
    }
  }

  haveListeners() {
    return this.listeners('debug').length > 0;
  }

  log(text: string) {
    this.emit('debug', text);
  }
}

export default Debug;
module.exports = Debug;
