import * as tls from 'tls';
import { isIP, Socket } from 'net';
import { EventEmitter } from 'events';

import Debug from './debug';

import Message from './message';
import { TYPE } from './packet';

import IncomingMessageStream from './incoming-message-stream';
import OutgoingMessageStream from './outgoing-message-stream';
import { TlsBridge } from './tls-bridge';

class MessageIO extends EventEmitter {
  // Node's `tls.TLSSocket#setMaxSendFragment` silently ignores values outside this range.
  // (A static class property rather than a named export, as the `module.exports`
  // assignment at the bottom of this file would clobber named exports for CJS consumers.)
  static readonly MAX_TLS_SEND_FRAGMENT_SIZE = 16384;

  declare socket: Socket;
  declare debug: Debug;

  declare tlsNegotiationComplete: boolean;

  declare private incomingMessageStream: IncomingMessageStream;
  declare outgoingMessageStream: OutgoingMessageStream;

  // The TLS socket negotiated via `startTls`.
  declare tlsSocket?: tls.TLSSocket;

  declare incomingMessageIterator: AsyncIterableIterator<Message>;

  constructor(socket: Socket, packetSize: number, debug: Debug) {
    super();

    this.socket = socket;
    this.debug = debug;

    this.tlsNegotiationComplete = false;

    this.incomingMessageStream = new IncomingMessageStream(this.debug);
    this.incomingMessageIterator = this.incomingMessageStream[Symbol.asyncIterator]();

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

    const maxSendFragment = Math.min(this.outgoingMessageStream.packetSize, MessageIO.MAX_TLS_SEND_FRAGMENT_SIZE);

    if (this.tlsSocket) {
      // Classic `encrypt: true` path: TLS is layered over a `TlsBridge`.
      this.tlsSocket.setMaxSendFragment(maxSendFragment);
    } else if (this.socket instanceof tls.TLSSocket) {
      // `encrypt: "strict"` (TDS 8.0) path: the socket itself is the TLS socket. Without
      // this, a server-initiated packet size change (ENVCHANGE) after login would leave
      // the original cap in place, potentially allowing oversized TLS records again.
      this.socket.setMaxSendFragment(maxSendFragment);
    }

    return this.outgoingMessageStream.packetSize;
  }

  // Negotiate TLS encryption.
  startTls(credentialsDetails: tls.SecureContextOptions, hostname: string, trustServerCertificate: boolean) {
    if (!credentialsDetails.maxVersion || !['TLSv1.2', 'TLSv1.1', 'TLSv1'].includes(credentialsDetails.maxVersion)) {
      credentialsDetails.maxVersion = 'TLSv1.2';
    }

    const secureContext = tls.createSecureContext(credentialsDetails);

    return new Promise<void>((resolve, reject) => {
      // Each step of the handshake is sent as a `PRELOGIN` message, and the
      // server responds with exactly one message containing its response.
      const bridge = new TlsBridge(this.socket, async (data) => {
        this.sendMessage(TYPE.PRELOGIN, data);

        const chunks = [];
        for await (const chunk of await this.readMessage()) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      });

      const tlsSocket = this.tlsSocket = tls.connect({
        socket: bridge,
        // The `host` is used to verify the server's certificate identity.
        // It is not used to establish a connection as a `socket` is
        // specified.
        host: hostname,
        // RFC 6066 does not allow IP addresses to be used as the server
        // name, so omit the SNI extension in that case.
        servername: isIP(hostname) ? '' : hostname,
        secureContext: secureContext,
        rejectUnauthorized: !trustServerCertificate
      });

      const onSecureConnect = () => {
        tlsSocket.removeListener('error', onError);
        bridge.removeListener('error', onError);

        // If we encounter any errors from this point on,
        // we just forward them to the actual network socket.
        tlsSocket.once('error', (err) => {
          this.socket.destroy(err);
        });

        const cipher = tlsSocket.getCipher();
        if (cipher) {
          this.debug.log('TLS negotiated (' + cipher.name + ', ' + cipher.version + ')');
        }

        this.emit('secure', tlsSocket);

        tlsSocket.setMaxSendFragment(Math.min(this.outgoingMessageStream.packetSize, MessageIO.MAX_TLS_SEND_FRAGMENT_SIZE));

        // Messages are exchanged via TLS from now on.
        this.outgoingMessageStream.unpipe(this.socket);
        this.socket.unpipe(this.incomingMessageStream);

        bridge.startPassthrough();

        tlsSocket.pipe(this.incomingMessageStream);
        this.outgoingMessageStream.pipe(tlsSocket);

        this.tlsNegotiationComplete = true;

        resolve();
      };

      const onError = (err?: Error) => {
        tlsSocket.removeListener('error', onError);
        tlsSocket.removeListener('secureConnect', onSecureConnect);
        bridge.removeListener('error', onError);

        tlsSocket.destroy();
        bridge.destroy();

        reject(err);
      };

      tlsSocket.once('error', onError);
      tlsSocket.once('secureConnect', onSecureConnect);
      bridge.once('error', onError);
    });
  }

  // TODO listen for 'drain' event when socket.write returns false.
  // TODO implement incomplete request cancellation (2.2.1.6)
  sendMessage(packetType: number, data?: Buffer, resetConnection?: boolean) {
    const message = new Message({ type: packetType, resetConnection: resetConnection });
    message.end(data);
    this.outgoingMessageStream.write(message);
    return message;
  }

  /**
   * Read the next incoming message from the socket.
   */
  async readMessage(): Promise<Message> {
    const result = await this.incomingMessageIterator.next();

    if (result.done) {
      throw new Error('unexpected end of message stream');
    }

    return result.value;
  }
}

export default MessageIO;
module.exports = MessageIO;
