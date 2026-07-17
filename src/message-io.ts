import DuplexPair from 'native-duplexpair';

import BufferList from 'bl';
import { Duplex, type Readable, type Writable } from 'stream';
import * as tls from 'tls';
import { isIP, Socket } from 'net';
import { EventEmitter } from 'events';

import Debug from './debug';

import Message from './message';
import { HEADER_LENGTH, Packet, TYPE } from './packet';
import { ConnectionError } from './errors';

import IncomingMessageStream from './incoming-message-stream';
import OutgoingMessageStream from './outgoing-message-stream';

class MessageIO extends EventEmitter {
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

  /**
   * Write a message with the given `type` and `payload` to the given `stream`,
   * wrapping it into TDS packets of the given `packetSize`.
   *
   * Respects backpressure from the stream, waiting for it to drain before
   * writing more data.
   *
   * If iterating the `payload` throws, the message is terminated with a final
   * packet that has the `IGNORE` flag set (telling the server to disregard the
   * message) and the error is re-thrown. Errors from the stream itself are
   * thrown as-is.
   *
   * @param stream The stream to write the message to.
   * @param debug The debug instance to use for logging.
   * @param packetSize The maximum packet size to use.
   * @param type The type of the message to write.
   * @param payload The payload to write.
   * @param resetConnection Whether the server should reset the connection when processing the message.
   */
  static async writeMessage(stream: Writable, debug: Debug, packetSize: number, type: number, payload: AsyncIterable<Buffer> | Iterable<Buffer>, resetConnection = false): Promise<void> {
    if (!stream.writable) {
      throw new Error('Premature close');
    }

    let drain: PromiseWithResolvers<void> | null = null;

    const onDrain = () => {
      if (drain) {
        const { resolve } = drain;
        drain = null;
        resolve();
      }
    };

    const onError = (err: Error) => {
      if (drain) {
        const { reject } = drain;
        drain = null;
        reject(err);
      }
    };

    const waitForDrain = () => {
      drain = Promise.withResolvers();
      return drain.promise;
    };

    stream.on('drain', onDrain);
    stream.on('close', onDrain);
    stream.on('error', onError);

    try {
      const bl = new BufferList();
      const length = packetSize - HEADER_LENGTH;
      let packetNumber = 0;

      const writePacket = async (packet: Packet) => {
        debug.packet('Sent', packet);
        debug.data(packet);

        if (stream.write(packet.buffer) === false) {
          await waitForDrain();
        }
      };

      let iterator;
      if ((payload as AsyncIterable<Buffer>)[Symbol.asyncIterator]) {
        iterator = (payload as AsyncIterable<Buffer>)[Symbol.asyncIterator]();
      } else {
        iterator = (payload as Iterable<Buffer>)[Symbol.iterator]();
      }

      while (true) {
        let value, done;
        try {
          ({ value, done } = await iterator.next());
        } catch (err) {
          // The payload errored while being iterated. If the stream is still
          // writable, terminate the message with the `IGNORE` flag set so the
          // server disregards everything sent so far.
          if (stream.writable) {
            const packet = new Packet(type);
            packet.packetId(packetNumber += 1);
            packet.resetConnection(resetConnection);
            packet.last(true);
            packet.ignore(true);

            await writePacket(packet);
          }

          throw err;
        }

        if (done) {
          break;
        }

        bl.append(value);

        while (bl.length > length) {
          const data = bl.slice(0, length);
          bl.consume(length);

          const packet = new Packet(type);
          packet.packetId(packetNumber += 1);
          packet.resetConnection(resetConnection);
          packet.addData(data);

          await writePacket(packet);
        }
      }

      const data = bl.slice();
      bl.consume(data.length);

      const packet = new Packet(type);
      packet.packetId(packetNumber += 1);
      packet.resetConnection(resetConnection);
      packet.last(true);
      packet.addData(data);

      await writePacket(packet);
    } finally {
      stream.removeListener('drain', onDrain);
      stream.removeListener('close', onDrain);
      stream.removeListener('error', onError);
    }
  }

  /**
   * Read the next TDS message from the given `stream`.
   *
   * Returns an async generator that yields the data of the message's packets
   * as they arrive. The generator throws if the stream emits an error or is
   * closed before the message was fully read.
   *
   * Any bytes following the message's last packet (e.g. the start of the next
   * message) are pushed back onto the stream, to be consumed by the next read.
   *
   * @param stream The stream to read the message from.
   * @param debug The debug instance to use for logging.
   */
  static async *readMessage(stream: Readable, debug: Debug): AsyncGenerator<Buffer, void, undefined> {
    if (!stream.readable) {
      throw new Error('Premature close');
    }

    const bl = new BufferList();

    let error: Error | null = null;
    let closed = false;
    let waiting: PromiseWithResolvers<void> | null = null;

    const onReadable = () => {
      if (waiting) {
        const { resolve } = waiting;
        waiting = null;
        resolve();
      }
    };

    const onError = (err: Error) => {
      error = err;

      if (waiting) {
        const { reject } = waiting;
        waiting = null;
        reject(err);
      }
    };

    const onClose = () => {
      closed = true;

      if (waiting) {
        const { reject } = waiting;
        waiting = null;
        reject(new Error('Premature close'));
      }
    };

    stream.on('readable', onReadable);
    stream.on('error', onError);
    stream.on('close', onClose);

    try {
      while (true) {
        if (error) {
          throw error;
        }

        if (closed) {
          throw new Error('Premature close');
        }

        let chunk: Buffer;
        while ((chunk = stream.read()) !== null) {
          bl.append(chunk);

          // The packet header is always 8 bytes of length.
          while (bl.length >= HEADER_LENGTH) {
            // Get the full packet length
            const length = bl.readUInt16BE(2);
            if (length < HEADER_LENGTH) {
              throw new ConnectionError('Unable to process incoming packet');
            }

            if (bl.length < length) {
              break;
            }

            const data = bl.slice(0, length);
            bl.consume(length);

            const packet = new Packet(data);
            debug.packet('Received', packet);
            debug.data(packet);

            yield packet.data();

            // Did the stream error while we yielded?
            if (error) {
              throw error;
            }

            if (packet.isLast()) {
              // This was the last packet of the message. Any data left in the
              // buffer belongs to the next message (e.g. the response to an
              // `ATTENTION` message sent by the client while reading an
              // incoming response), so push it back onto the stream.
              if (bl.length) {
                stream.unshift(bl.slice());
              }

              return;
            }
          }
        }

        // Wait for the stream to become readable again (or error out or close).
        waiting = Promise.withResolvers();
        await waiting.promise;
      }
    } finally {
      stream.removeListener('readable', onReadable);
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
    }
  }
}

export default MessageIO;
module.exports = MessageIO;
