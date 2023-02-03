import DuplexPair from 'native-duplexpair';

import { Duplex } from 'stream';
import * as tls from 'tls';
import { Socket } from 'net';
import { EventEmitter } from 'events';

import Debug from './debug';

import Message from './message';
import { TYPE } from './packet';

import IncomingMessageStream from './incoming-message-stream';
import OutgoingMessageStream from './outgoing-message-stream';

class MessageIO extends EventEmitter {
  socket: Socket;
  debug: Debug;

  tlsNegotiationComplete: boolean;

  private incomingMessageStream: IncomingMessageStream;
  outgoingMessageStream: OutgoingMessageStream;

  securePair?: {
    cleartext: tls.TLSSocket;
    encrypted: Duplex;
  }

  incomingMessageIterator: AsyncIterableIterator<Message>;

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

    if (this.securePair) {
      this.securePair.cleartext.setMaxSendFragment(this.outgoingMessageStream.packetSize);
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

      const onSecureConnect = () => {
        securePair.encrypted.removeListener('readable', onReadable);
        securePair.cleartext.removeListener('error', onError);
        securePair.cleartext.removeListener('secureConnect', onSecureConnect);

        // If we encounter any errors from this point on,
        // we just forward them to the actual network socket.
        securePair.cleartext.once('error', (err) => {
          this.socket.destroy(err);
        });

        const cipher = securePair.cleartext.getCipher();
        if (cipher) {
          this.debug.log('TLS negotiated (' + cipher.name + ', ' + cipher.version + ')');
        }

        this.emit('secure', securePair.cleartext);

        securePair.cleartext.setMaxSendFragment(this.outgoingMessageStream.packetSize);

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
        // When there is handshake data on the encryped stream of the secure pair,
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

  // TODO listen for 'drain' event when socket.write returns false.
  // TODO implement incomplete request cancelation (2.2.1.6)
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
