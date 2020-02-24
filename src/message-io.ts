// eslint-disable-next-line @typescript-eslint/no-var-requires
const DuplexPair = require('native-duplexpair');

import { Duplex } from 'stream';
import * as tls from 'tls';
import { Socket } from 'net';
import { EventEmitter, once } from 'events';

import Debug from './debug';

import Message from './message';
import { TYPE, Packet, HEADER_LENGTH, writePacketHeader } from './packet';

import IncomingMessageStream from './incoming-message-stream';
import OutgoingMessageStream from './outgoing-message-stream';
import BufferList from 'bl';

class MessageIO extends EventEmitter {
  socket: Socket;
  debug: Debug;

  tlsNegotiationComplete: boolean;

  incomingMessageStream: IncomingMessageStream;
  outgoingMessageStream: OutgoingMessageStream;

  securePair?: {
    cleartext: tls.TLSSocket;
    encrypted: Duplex;
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

    this.socket.pipe(this.incomingMessageStream as unknown as NodeJS.WritableStream);
    this.outgoingMessageStream.pipe(this.socket);
  }

  packetSize(...args: [number]) {
    if (args.length > 0) {
      const packetSize = args[0];
      this.debug.log('Packet size changed from ' + this.outgoingMessageStream.packetSize + ' to ' + packetSize);
      this.outgoingMessageStream.packetSize = packetSize;
    }

    if (this.securePair) {
      this.securePair.cleartext.setMaxSendFragment(this.outgoingMessageStream.packetSize);
    }

    return this.outgoingMessageStream.packetSize;
  }

  startTls(secureContext: tls.SecureContext, hostname: string, trustServerCertificate: boolean) {
    const duplexpair = new DuplexPair();
    const securePair = this.securePair = {
      cleartext: tls.connect({
        socket: duplexpair.socket1 as Socket,
        servername: hostname,
        secureContext: secureContext,
        rejectUnauthorized: !trustServerCertificate
      }),
      encrypted: duplexpair.socket2
    };

    // If an error happens in the TLS layer, there is nothing we can do about it.
    // Forward the error to the socket so the connection gets properly cleaned up.
    securePair.cleartext.on('error', (err?: Error) => {
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

    securePair.encrypted.on('data', (data: Buffer) => {
      this.sendMessage(TYPE.PRELOGIN, data, false);
    });
  }

  encryptAllFutureTraffic() {
    const securePair = this.securePair!;

    securePair.cleartext.setMaxSendFragment(this.outgoingMessageStream.packetSize);
    securePair.encrypted.removeAllListeners('data');

    this.outgoingMessageStream.unpipe(this.socket);
    this.socket.unpipe(this.incomingMessageStream as unknown as NodeJS.WritableStream);

    this.socket.pipe(securePair.encrypted);
    securePair.encrypted.pipe(this.socket);

    securePair.cleartext.pipe(this.incomingMessageStream as unknown as NodeJS.WritableStream);
    this.outgoingMessageStream.pipe(securePair.cleartext);

    this.tlsNegotiationComplete = true;
  }

  tlsHandshakeData(data: Buffer) {
    const securePair = this.securePair!;

    securePair.encrypted.write(data);
  }

  // TODO listen for 'drain' event when socket.write returns false.
  // TODO implement incomplete request cancelation (2.2.1.6)
  sendMessage(packetType: number, data?: Buffer, resetConnection?: boolean) {
    const message = new Message({ type: packetType, resetConnection: resetConnection });
    message.end(data);
    this.outgoingMessageStream.write(message);
    return message;
  }

  async write(message: Message) {
    const socket = this.securePair?.cleartext ?? this.socket;
    const packetSize = this.outgoingMessageStream.packetSize;
    const length = packetSize - HEADER_LENGTH;
    let packetNumber = 0;

    const bl = new BufferList();

    for await (const data of message) {
      if (message.ignore) {
        break;
      }

      bl.append(data);

      while (bl.length > length) {
        const data = Buffer.alloc(packetSize);
        bl.copy(data, HEADER_LENGTH, 0, length);
        bl.consume(length);

        writePacketHeader(data, {
          type: message.type,
          id: packetNumber++,
          resetConnection: message.resetConnection,
          ignore: false,
          length: data.length,
          last: false
        });

        // // TODO: Get rid of creating `Packet` instances here.
        // const packet = new Packet(message.type);
        // packet.packetId(packetNumber += 1);
        // packet.resetConnection(message.resetConnection);
        // packet.addData(data);

        // this.debug.packet('Sent', packet);
        // this.debug.data(packet);

        if (socket.write(data) === false) {
          await once(socket, 'drain');
        }
      }
    }

    const data = Buffer.alloc(bl.length + HEADER_LENGTH);
    bl.copy(data, HEADER_LENGTH);
    bl.consume();

    writePacketHeader(data, {
      type: message.type,
      id: packetNumber++,
      resetConnection: message.resetConnection,
      ignore: message.ignore,
      length: data.length,
      last: true
    });

    // TODO: Get rid of creating `Packet` instances here.
    // const packet = new Packet(message.type);
    // packet.packetId(packetNumber += 1);
    // packet.resetConnection(message.resetConnection);
    // packet.last(true);
    // packet.ignore(message.ignore);
    // packet.addData(data);

    // this.debug.packet('Sent', packet);
    // this.debug.data(packet);

    if (socket.write(data) === false) {
      await once(socket, 'drain');
    }
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
