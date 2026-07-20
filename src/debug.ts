import { EventEmitter } from 'events';
import * as util from 'util';
import { Packet } from './packet';
import type { Token } from './token/token';
import type Connection from './connection';
import {
  logChannel,
  packetReceivedChannel,
  packetSentChannel,
  payloadReceivedChannel,
  payloadSentChannel,
  tokenReceivedChannel
} from './diagnostics';

class Debug extends EventEmitter {
  declare options: {
    data: boolean;
    payload: boolean;
    packet: boolean;
    token: boolean;
  };

  declare indent: string;

  declare connection: Connection | undefined;

  /*
    @options    Which debug details should be sent.
                data    - dump of packet data
                payload - details of decoded payload
  */
  constructor({ data = false, payload = false, packet = false, token = false } = {}, connection?: Connection) {
    super();

    this.options = { data, payload, packet, token };
    this.indent = '  ';
    this.connection = connection;
  }

  packet(direction: 'Received' | 'Sent', packet: Packet) {
    const channel = direction === 'Sent' ? packetSentChannel : packetReceivedChannel;
    if (channel.hasSubscribers) {
      channel.publish({ connection: this.connection, packet });
    }

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

  payload(generatePayloadText: () => string, payload?: { toString(indent?: string): string }, direction: 'Sent' | 'Received' = 'Sent') {
    if (payload !== undefined) {
      const channel = direction === 'Sent' ? payloadSentChannel : payloadReceivedChannel;
      if (channel.hasSubscribers) {
        channel.publish({ connection: this.connection, payload });
      }
    }

    if (this.haveListeners() && this.options.payload) {
      this.log(generatePayloadText());
    }
  }

  token(token: Token) {
    if (tokenReceivedChannel.hasSubscribers) {
      tokenReceivedChannel.publish({ connection: this.connection, token });
    }

    if (this.haveListeners() && this.options.token) {
      this.log(util.inspect(token, { showHidden: false, depth: 5, colors: true }));
    }
  }

  /**
   * @deprecated Listening for `'debug'` events is deprecated. Subscribe to the
   *   diagnostics channels published by `tedious` instead.
   */
  haveListeners() {
    return this.listeners('debug').length > 0;
  }

  log(text: string) {
    if (logChannel.hasSubscribers) {
      logChannel.publish({ connection: this.connection, message: text });
    }

    this.emit('debug', text);
  }
}

export default Debug;
module.exports = Debug;
