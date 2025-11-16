import DuplexPair from 'native-duplexpair';

import { Duplex, type Readable, type Writable } from 'stream';
import * as tls from 'tls';
import { Socket } from 'net';
import { EventEmitter } from 'events';

import Debug from './debug';

import Message from './message';
import { HEADER_LENGTH, Packet, TYPE } from './packet';

import IncomingMessageStream from './incoming-message-stream';
import OutgoingMessageStream from './outgoing-message-stream';
import { BufferList } from 'bl';
import { ConnectionError } from './errors';

function withResolvers<T>() {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { resolve: resolve!, reject: reject!, promise };
}

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

  /**
   * Write the given `payload` wrapped in TDS messages to the given `stream`.
   *
   * @param stream The stream to write the message to.
   * @param debug The debug instance to use for logging.
   * @param packetSize The maximum packet size to use.
   * @param type The type of the message to write.
   * @param payload The payload to write.
   * @param resetConnection Whether the server should reset the connection after processing the message.
   */
  static async writeMessage(stream: Writable, debug: Debug, packetSize: number, type: number, payload: AsyncIterable<Buffer> | Iterable<Buffer>, resetConnection = false) {
    if (!stream.writable) {
      throw new Error('Premature close');
    }

    let drainResolve: (() => void) | null = null;
    let drainReject: ((reason?: any) => void) | null = null;

    function onDrain() {
      if (drainResolve) {
        const cb = drainResolve;
        drainResolve = null;
        drainReject = null;
        cb();
      }
    }

    const waitForDrain = () => {
      let promise;
      ({ promise, resolve: drainResolve, reject: drainReject } = withResolvers<void>());
      return promise;
    };

    function onError(err: Error) {
      if (drainReject) {
        const cb = drainReject;
        drainResolve = null;
        drainReject = null;
        cb(err);
      }
    }

    stream.on('drain', onDrain);
    stream.on('close', onDrain);
    stream.on('error', onError);

    try {
      const bl = new BufferList();
      const length = packetSize - HEADER_LENGTH;
      let packetNumber = 0;

      let isAsync;
      let iterator;

      if ((payload as AsyncIterable<Buffer>)[Symbol.asyncIterator]) {
        isAsync = true;
        iterator = (payload as AsyncIterable<Buffer>)[Symbol.asyncIterator]();
      } else {
        isAsync = false;
        iterator = (payload as Iterable<Buffer>)[Symbol.iterator]();
      }

      while (true) {
        try {
          let value, done;
          if (isAsync) {
            ({ value, done } = await (iterator as AsyncIterator<Buffer>).next());
          } else {
            ({ value, done } = (iterator as Iterator<Buffer>).next());
          }

          if (done) {
            break;
          }

          bl.append(value);
        } catch (err) {
          // If the stream is still writable, the error came from
          // the payload. We will end the message with the ignore flag set.
          if (stream.writable) {
            const packet = new Packet(type);
            packet.packetId(packetNumber += 1);
            packet.resetConnection(resetConnection);
            packet.last(true);
            packet.ignore(true);

            debug.packet('Sent', packet);
            debug.data(packet);

            if (stream.write(packet.buffer) === false) {
              await waitForDrain();
            }
          }

          throw err;
        }

        while (bl.length > length) {
          const data = bl.slice(0, length);
          bl.consume(length);

          // TODO: Get rid of creating `Packet` instances here.
          const packet = new Packet(type);
          packet.packetId(packetNumber += 1);
          packet.resetConnection(resetConnection);
          packet.addData(data);

          debug.packet('Sent', packet);
          debug.data(packet);

          if (stream.write(packet.buffer) === false) {
            await waitForDrain();
          }
        }
      }

      const data = bl.slice();
      bl.consume(data.length);

      // TODO: Get rid of creating `Packet` instances here.
      const packet = new Packet(type);
      packet.packetId(packetNumber += 1);
      packet.resetConnection(resetConnection);
      packet.last(true);
      packet.ignore(false);
      packet.addData(data);

      debug.packet('Sent', packet);
      debug.data(packet);

      if (stream.write(packet.buffer) === false) {
        await waitForDrain();
      }
    } finally {
      stream.removeListener('drain', onDrain);
      stream.removeListener('close', onDrain);
      stream.removeListener('error', onError);
    }
  }

  /**
   * Read the next TDS message from the given `stream`.
   *
   * This method returns an async generator that yields the data of the next message.
   * The generator will throw an error if the stream is closed before the message is fully read.
   * The generator will throw an error if the stream emits an error event.
   *
   * @param stream The stream to read the message from.
   * @param debug The debug instance to use for logging.
   * @returns An async generator that yields the data of the next message.
   */
  static async *readMessage(stream: Readable, debug: Debug) {
    if (!stream.readable) {
      throw new Error('Premature close');
    }

    const bl = new BufferList();

    let resolve: ((value: void | PromiseLike<void>) => void) | null = null;
    let reject: ((reason?: any) => void) | null = null;

    const waitForReadable = () => {
      let promise;
      ({ promise, resolve, reject } = withResolvers<void>());
      return promise;
    };

    const onReadable = () => {
      if (resolve) {
        const cb = resolve;
        resolve = null;
        reject = null;
        cb();
      }
    };

    const onError = (err: Error) => {
      if (reject) {
        const cb = reject;
        resolve = null;
        reject = null;
        cb(err);
      }
    };

    const onClose = () => {
      if (reject) {
        const cb = reject;
        resolve = null;
        reject = null;
        cb(new Error('Premature close'));
      }
    };

    stream.on('readable', onReadable);
    stream.on('error', onError);
    stream.on('close', onClose);

    try {
      while (true) {
        // Wait for the stream to become readable (or error out or close).
        await waitForReadable();

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

            if (bl.length >= length) {
              const data = bl.slice(0, length);
              bl.consume(length);

              // TODO: Get rid of creating `Packet` instances here.
              const packet = new Packet(data);
              debug.packet('Received', packet);
              debug.data(packet);

              yield packet.data();

              // Did the stream error while we yielded?
              // if (error) {
              //   throw error;
              // }

              if (packet.isLast()) {
                // This was the last packet. Is there any data left in the buffer?
                // If there is, this might be coming from the next message (e.g. a response to a `ATTENTION`
                // message sent from the client while reading an incoming response).
                //
                // Put any remaining bytes back on the stream so we can read them on the next `readMessage` call.
                if (bl.length) {
                  stream.unshift(bl.slice());
                }

                return;
              }
            }
          }
        }
      }
    } finally {
      stream.removeListener('readable', onReadable);
      stream.removeListener('close', onClose);
      stream.removeListener('error', onError);
    }
  }
}

export default MessageIO;
module.exports = MessageIO;
