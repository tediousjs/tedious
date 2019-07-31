/* globals $Values */

import Debug from './debug';
type Duplex = import('stream').Duplex;
type TLSSocket = import('tls').TLSSocket;
type Socket = import('net').Socket;

import * as tls from 'tls';
import DuplexPair from 'native-duplexpair';
import { EventEmitter } from 'events';

import { TYPE } from './packet';

import Message from './message';

import IncomingMessageStream from './incoming-message-stream';
import OutgoingMessageStream from './outgoing-message-stream';

class MessageIO extends EventEmitter {
  socket: Socket;
  debug: Debug;

  tlsNegotiationComplete: boolean;

  incomingMessageStream: IncomingMessageStream;
  outgoingMessageStream: OutgoingMessageStream;

  securePair?: {
    cleartext: TLSSocket,
    encrypted: Duplex
  }

  constructor(socket: Socket, packetSize: number, debug: Debug) {
    super();

    this.socket = socket;
    this.debug = debug;

    this.tlsNegotiationComplete = false;

    this.incomingMessageStream = new IncomingMessageStream(this.debug);
    this.incomingMessageStream.on('data', (message: Message) => {
      message.on('data', (chunk: Buffer) => { this.emit('data', chunk); });
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

  startTls(secureContext: tls.SecureContext, hostname: string, trustServerCertificate: boolean) {
    const duplexpair = new DuplexPair();
    const socket = (duplexpair.socket1 as unknown as Socket);
    const securePair = this.securePair = {
      cleartext: tls.connect({
        socket: socket,
        servername: hostname,
        secureContext: secureContext,
        rejectUnauthorized: !trustServerCertificate
      }),
      encrypted: duplexpair.socket2
    };

    // If an error happens in the TLS layer, there is nothing we can do about it.
    // Forward the error to the socket so the connection gets properly cleaned up.
    securePair.cleartext.on('error', (err: Error) => {
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

      securePair.encrypted.removeAllListeners('data');

      this.outgoingMessageStream.unpipe(this.socket);
      this.socket.unpipe(this.incomingMessageStream);

      this.socket.pipe(securePair.encrypted);
      securePair.encrypted.pipe(this.socket);

      securePair.cleartext.pipe(this.incomingMessageStream);
      this.outgoingMessageStream.pipe(securePair.cleartext);

      this.tlsNegotiationComplete = true;
    });

    securePair.encrypted.on('data', (data: Buffer) => {
      this.sendMessage(TYPE.PRELOGIN, data, false);
    });
  }

  tlsHandshakeData(data: Buffer) {
    if (this.securePair) {
      this.securePair.encrypted.write(data);
    }
  }

  // TODO listen for 'drain' event when socket.write returns false.
  // TODO implement incomplete request cancelation (2.2.1.6)
  sendMessage(packetType: typeof TYPE[keyof typeof TYPE], data?: Buffer, resetConnection: boolean = false) {
    const message = new Message({ type: packetType, resetConnection: resetConnection });
    message.end(data);
    this.outgoingMessageStream.write(message);
    return message;
  }

  // Temporarily suspends the flow of incoming packets.
  pause() {
    this.incomingMessageStream.pause();
  }

  // Resumes the flow of incoming packets.
  resume() {
    this.incomingMessageStream.resume();
  }
}

export default MessageIO;
module.exports = MessageIO;
