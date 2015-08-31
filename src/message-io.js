import tls from 'tls';
import crypto from 'crypto';
import { EventEmitter } from 'events';

import {} from './buffertools';
import { Packet, TYPE, HEADER_LENGTH as packetHeaderLength } from './packet';
import StreamParser from './stream-parser';

class ReadablePacketStream extends StreamParser {
  *parser() {
    for (;;) {
      const header = yield this.readBuffer(packetHeaderLength);
      const length = header.readUInt16BE(2);
      const data = yield this.readBuffer(length - packetHeaderLength);

      this.push(new Packet(Buffer.concat([header, data])));
    }
  }
}

export default class MessageIO extends EventEmitter {
  constructor(socket, _packetSize, debug) {
    super();

    this.socket = socket;
    this._packetSize = _packetSize;
    this.debug = debug;
    this.sendPacket = this.sendPacket.bind(this);

    this.packetStream = new ReadablePacketStream();
    this.packetStream.on('data', (packet) => {
      this.logPacket('Received', packet);
      this.emit('data', packet.data());
      if (packet.isLast()) {
        this.emit('message');
      }
    });

    this.socket.pipe(this.packetStream);
    this.packetDataSize = this._packetSize - packetHeaderLength;
  }

  packetSize(packetSize) {
    if (arguments.length > 0) {
      this.debug.log("Packet size changed from " + this._packetSize + " to " + packetSize);
      this._packetSize = packetSize;
      this.packetDataSize = this._packetSize - packetHeaderLength;
    }
    return this._packetSize;
  }

  startTls(credentialsDetails) {
    const credentials = tls.createSecureContext ? tls.createSecureContext(credentialsDetails) : crypto.createCredentials(credentialsDetails);

    this.securePair = tls.createSecurePair(credentials);
    this.tlsNegotiationComplete = false;

    this.securePair.on('secure', () => {
      const cipher = this.securePair.cleartext.getCipher();
      this.debug.log("TLS negotiated (" + cipher.name + ", " + cipher.version + ")");
      this.emit('secure', this.securePair.cleartext);
      this.encryptAllFutureTraffic();
    });

    this.securePair.encrypted.on('data', (data) => {
      this.sendMessage(TYPE.PRELOGIN, data);
    });

    // On Node >= 0.12, the encrypted stream automatically starts spewing out
    // data once we attach a `data` listener. But on Node <= 0.10.x, this is not
    // the case. We need to kick the cleartext stream once to get the
    // encrypted end of the secure pair to emit the TLS handshake data.
    this.securePair.cleartext.write('');
  }

  encryptAllFutureTraffic() {
    this.socket.unpipe(this.packetStream);
    this.securePair.encrypted.removeAllListeners('data');
    this.socket.pipe(this.securePair.encrypted);
    this.securePair.encrypted.pipe(this.socket);
    this.securePair.cleartext.pipe(this.packetStream);
    this.tlsNegotiationComplete = true;
  }

  tlsHandshakeData(data) {
    this.securePair.encrypted.write(data);
  }

  // TODO listen for 'drain' event when socket.write returns false.
  // TODO implement incomplete request cancelation (2.2.1.6)
  sendMessage(packetType, data, resetConnection) {
    let numberOfPackets;
    if (data) {
      numberOfPackets = (Math.floor((data.length - 1) / this.packetDataSize)) + 1;
    } else {
      numberOfPackets = 1;
      data = new Buffer(0);
    }

    for (let packetNumber = 0; packetNumber < numberOfPackets; packetNumber++) {
      const payloadStart = packetNumber * this.packetDataSize;

      let payloadEnd;
      if (packetNumber < numberOfPackets - 1) {
        payloadEnd = payloadStart + this.packetDataSize;
      } else {
        payloadEnd = data.length;
      }

      const packetPayload = data.slice(payloadStart, payloadEnd);

      const packet = new Packet(packetType);
      packet.last(packetNumber === numberOfPackets - 1);
      packet.resetConnection(resetConnection);
      packet.packetId(packetNumber + 1);
      packet.addData(packetPayload);
      this.sendPacket(packet);
    }
  }

  sendPacket(packet) {
    this.logPacket('Sent', packet);
    if (this.securePair && this.tlsNegotiationComplete) {
      this.securePair.cleartext.write(packet.buffer);
    } else {
      this.socket.write(packet.buffer);
    }
  }

  logPacket(direction, packet) {
    this.debug.packet(direction, packet);
    return this.debug.data(packet);
  }
}
