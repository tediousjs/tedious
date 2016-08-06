'use strict';

const tls = require('tls');
const crypto = require('crypto');
const EventEmitter = require('events').EventEmitter;
const Transform = require('readable-stream').Transform;

require('./buffertools');

const Packet = require('./packet').Packet;
const TYPE = require('./packet').TYPE;
const packetHeaderLength = require('./packet').HEADER_LENGTH;

class ReadablePacketStream extends Transform {
  constructor() {
    super({ objectMode: true });

    this.buffer = new Buffer(0);
    this.position = 0;
  }

  _transform(chunk, encoding, callback) {
    if (this.position === this.buffer.length) {
      // If we have fully consumed the previous buffer,
      // we can just replace it with the new chunk
      this.buffer = chunk;
    } else {
      // If we haven't fully consumed the previous buffer,
      // we simply concatenate the leftovers and the new chunk.
      this.buffer = Buffer.concat([
        this.buffer.slice(this.position), chunk
      ], (this.buffer.length - this.position) + chunk.length);
    }

    this.position = 0;

    // The packet header is always 8 bytes of length.
    while (this.buffer.length >= this.position + packetHeaderLength) {
      // Get the full packet length
      const length = this.buffer.readUInt16BE(this.position + 2);

      if (this.buffer.length >= this.position + length) {
        const data = this.buffer.slice(this.position, this.position + length);
        this.position += length;
        this.push(new Packet(data));
      } else {
        // Not enough data to provide the next packet. Stop here and wait for
        // the next call to `_transform`.
        break;
      }
    }

    callback();
  }
}

module.exports = class MessageIO extends EventEmitter {
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
      this.debug.log('Packet size changed from ' + this._packetSize + ' to ' + packetSize);
      this._packetSize = packetSize;
      this.packetDataSize = this._packetSize - packetHeaderLength;
    }
    return this._packetSize;
  }

  startTls(credentialsDetails, trustServerCertificate) {
    const credentials = tls.createSecureContext ? tls.createSecureContext(credentialsDetails) : crypto.createCredentials(credentialsDetails);

    this.securePair = tls.createSecurePair(credentials);
    this.tlsNegotiationComplete = false;

    this.securePair.on('secure', () => {
      const cipher = this.securePair.cleartext.getCipher();

      if (!trustServerCertificate) {
        const verifyError = this.securePair.ssl.verifyError();

        if (verifyError) {
          this.securePair.destroy();
          this.socket.destroy(verifyError);
          return;
        }
      }

      this.debug.log('TLS negotiated (' + cipher.name + ', ' + cipher.version + ')');
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
};
