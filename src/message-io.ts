import DuplexPair from 'native-duplexpair';

import { Duplex } from 'stream';
import * as tls from 'tls';
import { isIP, Socket } from 'net';
import { EventEmitter } from 'events';

import Debug from './debug';

import Message from './message';
import { TYPE } from './packet';

import IncomingMessageStream from './incoming-message-stream';
import OutgoingMessageStream from './outgoing-message-stream';

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

  declare securePair?: {
    cleartext: tls.TLSSocket;
    encrypted: Duplex;
  };

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

    if (this.securePair) {
      // Classic `encrypt: true` path: TLS is layered over a `DuplexPair`.
      this.securePair.cleartext.setMaxSendFragment(maxSendFragment);
    } else if (this.socket instanceof tls.TLSSocket) {
      // `encrypt: "strict"` (TDS 8.0) path: the socket itself is the TLS socket. Without
      // this, a server-initiated packet size change (ENVCHANGE) after login would leave
      // the original cap in place, potentially allowing oversized TLS records again.
      this.socket.setMaxSendFragment(maxSendFragment);
    }

    return this.outgoingMessageStream.packetSize;
  }

  // Negotiate TLS encryption.
  //
  // With `loginOnly`, TLS is only used to encrypt the first packet of the next
  // message sent (the `LOGIN7` message). As agreed between client and server
  // for login-only encryption (`ENCRYPT_OFF` in MS-TDS), all following packets
  // are sent and received unencrypted.
  startTls(credentialsDetails: tls.SecureContextOptions, hostname: string, trustServerCertificate: boolean, loginOnly = false) {
    if (!credentialsDetails.maxVersion || !['TLSv1.2', 'TLSv1.1', 'TLSv1'].includes(credentialsDetails.maxVersion)) {
      credentialsDetails.maxVersion = 'TLSv1.2';
    }

    const secureContext = tls.createSecureContext(credentialsDetails);

    return new Promise<void>((resolve, reject) => {
      const duplexpair = new DuplexPair();
      const securePair = {
        cleartext: tls.connect({
          socket: duplexpair.socket1 as Socket,
          // The `host` is used to verify the server's certificate identity.
          // It is not used to establish a connection as a `socket` is
          // specified.
          host: hostname,
          // RFC 6066 does not allow IP addresses to be used as the server
          // name, so omit the SNI extension in that case.
          servername: isIP(hostname) ? '' : hostname,
          secureContext: secureContext,
          rejectUnauthorized: !trustServerCertificate
        }),
        encrypted: duplexpair.socket2
      };

      const onSecureConnect = () => {
        securePair.encrypted.removeListener('readable', onReadable);
        securePair.cleartext.removeListener('error', onError);
        securePair.cleartext.removeListener('secureConnect', onSecureConnect);

        // If we encounter any errors from this point on,
        // we just forward them to the actual network socket.
        const onSecureError = (err: Error) => {
          this.socket.destroy(err);
        };
        securePair.cleartext.once('error', onSecureError);

        const cipher = securePair.cleartext.getCipher();
        if (cipher) {
          this.debug.log('TLS negotiated (' + cipher.name + ', ' + cipher.version + ')' + (loginOnly ? ' for the login packet only' : ''));
        }

        if (loginOnly) {
          this.encryptNextPacket(securePair, onSecureError);
          resolve();
          return;
        }

        this.securePair = securePair;

        this.emit('secure', securePair.cleartext);

        securePair.cleartext.setMaxSendFragment(Math.min(this.outgoingMessageStream.packetSize, MessageIO.MAX_TLS_SEND_FRAGMENT_SIZE));

        this.outgoingMessageStream.unpipe(this.socket);
        this.socket.unpipe(this.incomingMessageStream);

        this.socket.pipe(securePair.encrypted);
        securePair.encrypted.pipe(this.socket);

        securePair.cleartext.pipe(this.incomingMessageStream);
        this.outgoingMessageStream.pipe(securePair.cleartext);

        this.tlsNegotiationComplete = true;

        resolve();
      };

      const onError = (err?: Error) => {
        securePair.encrypted.removeListener('readable', onReadable);
        securePair.cleartext.removeListener('error', onError);
        securePair.cleartext.removeListener('secureConnect', onSecureConnect);

        securePair.cleartext.destroy();
        securePair.encrypted.destroy();

        reject(err);
      };

      const onReadable = () => {
        // When there is handshake data on the encrypted stream of the secure pair,
        // we wrap it into a `PRELOGIN` message and send it to the server.
        //
        // For each `PRELOGIN` message we sent we get back exactly one response message
        // that contains the server's handshake response data.
        const message = new Message({ type: TYPE.PRELOGIN, resetConnection: false });

        let chunk;
        while (chunk = securePair.encrypted.read()) {
          message.write(chunk);
        }
        this.outgoingMessageStream.write(message);
        message.end();

        this.readMessage().then(async (response) => {
          // Setup readable handler for the next round of handshaking.
          // If we encounter a `secureConnect` on the cleartext side
          // of the secure pair, the `readable` handler is cleared
          // and no further handshake handling will happen.
          securePair.encrypted.once('readable', onReadable);

          for await (const data of response) {
            // We feed the server's handshake response back into the
            // encrypted end of the secure pair.
            securePair.encrypted.write(data);
          }
        }).catch(onError);
      };

      securePair.cleartext.once('error', onError);
      securePair.cleartext.once('secureConnect', onSecureConnect);
      securePair.encrypted.once('readable', onReadable);
    });
  }

  // Send the next outgoing packet through the given login-only TLS session,
  // then tear the session down and send everything else unencrypted.
  private encryptNextPacket(securePair: { cleartext: tls.TLSSocket, encrypted: Duplex }, onSecureError: (err: Error) => void) {
    // The TLS record size must not be capped below the packet size, as the
    // server expects the encrypted packet to arrive in a single TLS record.
    securePair.cleartext.setMaxSendFragment(MessageIO.MAX_TLS_SEND_FRAGMENT_SIZE);

    const forwardEncrypted = (data: Buffer) => {
      this.socket.write(data);
    };

    this.outgoingMessageStream.unpipe(this.socket);
    this.outgoingMessageStream.once('data', (packet: Buffer) => {
      // Hold back the following packets until the encrypted one has been written.
      this.outgoingMessageStream.pause();

      securePair.encrypted.on('data', forwardEncrypted);
      securePair.cleartext.write(packet, (err) => {
        securePair.encrypted.removeListener('data', forwardEncrypted);
        securePair.cleartext.removeListener('error', onSecureError);

        securePair.cleartext.destroy();
        securePair.encrypted.destroy();

        if (err) {
          this.socket.destroy(err);
          return;
        }

        this.outgoingMessageStream.pipe(this.socket);
      });
    });

    // `unpipe` paused the stream, and adding a `data` listener does not resume it.
    this.outgoingMessageStream.resume();
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
