// @flow

/* globals $Values */

import type Debug from './debug';
import type { Duplex } from 'stream';
import type { TLSSocket } from 'tls';
import type { Socket } from 'net';

const tls = require('tls');
const DuplexPair = require('native-duplexpair');
const { EventEmitter} = require('events');

const { TYPE } = require('./packet');

const Message = require('./message');
const IncomingMessageStream = require('./incoming-message-stream');
const OutgoingMessageStream = require('./outgoing-message-stream');

module.exports = class MessageIO extends EventEmitter {
  socket: Socket;
  debug: Debug;

  tlsNegotiationComplete: boolean;

  incomingMessageStream: IncomingMessageStream;
  outgoingMessageStream: OutgoingMessageStream;

  securePair: {
    cleartext: TLSSocket,
    encrypted: Duplex
  }

  constructor(socket: Socket, packetSize: number, debug: Debug) {
    super();

    this.socket = socket;
    this.debug = debug;

    this.tlsNegotiationComplete = false;

    this.incomingMessageStream = new IncomingMessageStream(this.debug);
    this.incomingMessageStream.on('data', (message) => {
      message.on('data', (chunk) => { this.emit('data', chunk); });
      message.on('end', () => { this.emit('message'); });
    });

    this.outgoingMessageStream = new OutgoingMessageStream(this.debug, { packetSize: packetSize });

    this.socket.pipe(this.incomingMessageStream);
    this.outgoingMessageStream.pipe(this.socket);
  }

  packetSize(...args: [number]) {
    if (args.length > 0) {
      const packetSize = args[0];
      this.debug.log('Packet size changed from ' + this.outgoingMessageStream.packetSize + ' to ' + packetSize);
      this.outgoingMessageStream.packetSize = packetSize;
    }
    return this.outgoingMessageStream.packetSize;
  }

  startTls(secureContext: Object, hostname: string, trustServerCertificate: boolean) {
    const duplexpair = new DuplexPair();
    const securePair = this.securePair = {
      cleartext: tls.connect({
        socket: duplexpair.socket1,
        servername: hostname,
        secureContext: secureContext,
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
      if (cipher) {
        this.debug.log('TLS negotiated (' + cipher.name + ', ' + cipher.version + ')');
      }
      this.emit('secure', securePair.cleartext);
      this.encryptAllFutureTraffic();
    });

    securePair.encrypted.on('data', (data) => {
      this.sendMessage(TYPE.PRELOGIN, data, false);
    });
  }

  encryptAllFutureTraffic() {
    this.securePair.encrypted.removeAllListeners('data');

    this.outgoingMessageStream.unpipe(this.socket);
    this.socket.unpipe(this.incomingMessageStream);

    this.socket.pipe(this.securePair.encrypted);
    this.securePair.encrypted.pipe(this.socket);

    this.securePair.cleartext.pipe(this.incomingMessageStream);
    this.outgoingMessageStream.pipe(this.securePair.cleartext);

    this.tlsNegotiationComplete = true;
  }

  tlsHandshakeData(data: Buffer) {
    this.securePair.encrypted.write(data);
  }

  // TODO listen for 'drain' event when socket.write returns false.
  // TODO implement incomplete request cancelation (2.2.1.6)
  sendMessage(packetType: $Values<typeof TYPE>, data: Buffer, resetConnection: boolean) {
    const message = new Message({ type: packetType, resetConnection: resetConnection });
    message.end(data);
    this.outgoingMessageStream.write(message);
  }

  // Temporarily suspends the flow of incoming packets.
  pause() {
    this.incomingMessageStream.pause();
  }

  // Resumes the flow of incoming packets.
  resume() {
    this.incomingMessageStream.resume();
  }
};
