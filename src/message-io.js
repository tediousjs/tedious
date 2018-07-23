const tls = require('tls');
const crypto = require('crypto');
const DuplexPair = require('native-duplexpair');
const EventEmitter = require('events').EventEmitter;
const Transform = require('readable-stream').Transform;

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

    this.tlsNegotiationComplete = false;

    this.packetStream = new ReadablePacketStream();
    this.packetStream.on('data', (packet) => {
      this.logPacket('Received', packet);
      this.emit('data', packet.data());
      if (packet.isLast()) {
        this.emit('message');
      }
    });

    this.socket.pipe(this.packetStream);
    this.socket.on('drain', () => {
      this.emit('drain');
    });
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

  startTls(credentialsDetails, hostname, trustServerCertificate) {
    const credentials = tls.createSecureContext ? tls.createSecureContext(credentialsDetails) : crypto.createCredentials(credentialsDetails);

    const duplexpair = new DuplexPair();
    const securePair = this.securePair = {
      cleartext: tls.connect({
        socket: duplexpair.socket1,
        servername: hostname,
        secureContext: credentials,
        rejectUnauthorized: !trustServerCertificate
      }),
      encrypted: duplexpair.socket2
    };

    // If an error happens in the TLS layer, there is nothing we can do about it.
    // Forward the error to the socket so the connection gets properly cleaned up.
    securePair.cleartext.on('error', (err) => {
      // Streams in node.js versions before 8.0.0 don't support `.destroy`
      if (typeof securePair.encrypted.destroy === 'function') {
        securePair.encrypted.destroy();
      }
      this.socket.destroy(err);
    });

    securePair.cleartext.on('secureConnect', () => {
      const cipher = securePair.cleartext.getCipher();
      this.debug.log('TLS negotiated (' + cipher.name + ', ' + cipher.version + ')');
      this.emit('secure', securePair.cleartext);
      this.encryptAllFutureTraffic();
    });

    securePair.encrypted.on('data', (data) => {
      this.sendMessage(TYPE.PRELOGIN, data);
    });
  }

  encryptAllFutureTraffic() {
    this.socket.unpipe(this.packetStream);
    this.socket.removeAllListeners('drain');
    this.securePair.encrypted.removeAllListeners('data');
    this.socket.pipe(this.securePair.encrypted);
    this.securePair.encrypted.pipe(this.socket);
    this.securePair.cleartext.pipe(this.packetStream);
    this.securePair.cleartext.on('drain', () => {
      this.emit('drain');
    });
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

  // Returns false to apply backpressure.
  sendPacket(packet) {
    this.logPacket('Sent', packet);
    if (this.securePair && this.tlsNegotiationComplete) {
      return this.securePair.cleartext.write(packet.buffer);
    } else {
      return this.socket.write(packet.buffer);
    }
  }

  logPacket(direction, packet) {
    this.debug.packet(direction, packet);
    this.debug.data(packet);
  }

  // Temporarily suspends the flow of incoming packets.
  pause() {
    this.packetStream.pause();
  }

  // Resumes the flow of incoming packets.
  resume() {
    this.packetStream.resume();
  }
};
