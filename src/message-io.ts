import DuplexPair from 'native-duplexpair';

import { Duplex, Readable, Writable } from 'stream';
import * as tls from 'tls';
import { Socket } from 'net';
import { EventEmitter } from 'events';

import Debug from './debug';

import { HEADER_LENGTH, Packet, TYPE } from './packet';

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
  socket: Socket;
  debug: Debug;

  tlsNegotiationComplete: boolean;

  securePair?: {
    cleartext: tls.TLSSocket;
    encrypted: Duplex;
  };

  private _packetSize: number;

  constructor(socket: Socket, packetSize: number, debug: Debug) {
    super();

    this.socket = socket;
    this.debug = debug;

    this._packetSize = packetSize;

    this.tlsNegotiationComplete = false;
  }

  get packetSize(): number {
    return this._packetSize;
  }

  set packetSize(value: number) {
    this._packetSize = value;

    if (this.securePair) {
      this.securePair.cleartext.setMaxSendFragment(this._packetSize);
    }
  }

  // Negotiate TLS encryption.
  async startTls(credentialsDetails: tls.SecureContextOptions, hostname: string, trustServerCertificate: boolean) {
    if (!credentialsDetails.maxVersion || !['TLSv1.2', 'TLSv1.1', 'TLSv1'].includes(credentialsDetails.maxVersion)) {
      credentialsDetails.maxVersion = 'TLSv1.2';
    }

    const secureContext = tls.createSecureContext(credentialsDetails);

    return await new Promise<void>((resolve, reject) => {
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

        securePair.cleartext.setMaxSendFragment(this._packetSize);

        this.socket.pipe(securePair.encrypted);
        this.socket.once('error', (err) => {
          securePair.cleartext.destroy(err);
        });
        this.socket.once('close', () => {
          securePair.cleartext.destroy();
        });


        securePair.encrypted.pipe(this.socket);

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
        (async () => {
          // When there is handshake data on the encryped stream of the secure pair,
          // we wrap it into a `PRELOGIN` message and send it to the server.
          //
          // For each `PRELOGIN` message we sent we get back exactly one response message
          // that contains the server's handshake response data.
          const chunks: Buffer[] = [];
          let chunk;
          while ((chunk = securePair.encrypted.read()) !== null) {
            chunks.push(chunk);
          }

          await this.writeMessage(TYPE.PRELOGIN, Readable.from(chunks));

          for await (const chunk of this.readMessage()) {
            // We feed the server's handshake response back into the
            // encrypted end of the secure pair.
            securePair.encrypted.write(chunk);
          }

          if (!this.tlsNegotiationComplete) {
            securePair.encrypted.once('readable', onReadable);
          }
        })().catch(onError);
      };

      securePair.cleartext.once('error', onError);
      securePair.cleartext.once('secureConnect', onSecureConnect);
      securePair.encrypted.once('readable', onReadable);
    });
  }

  async writeMessage(type: number, payload: AsyncIterable<Buffer> | Iterable<Buffer>, resetConnection = false) {
    const stream = this.tlsNegotiationComplete ? this.securePair!.cleartext : this.socket;

    return await MessageIO.writeMessage(stream, this.debug, this._packetSize, type, payload, resetConnection);
  }

  static async writeMessage(stream: Writable, debug: Debug, packetSize: number, type: number, payload: AsyncIterable<Buffer> | Iterable<Buffer>, resetConnection = false) {
    const bl = new BufferList();
    const length = packetSize - HEADER_LENGTH;
    let packetNumber = 0;

    const iterator = (payload as AsyncIterable<Buffer>)[Symbol.asyncIterator] ? (payload as AsyncIterable<Buffer>)[Symbol.asyncIterator]() : (payload as Iterable<Buffer>)[Symbol.iterator]();

    while (true) {
      const { resolve, reject, promise } = withResolvers<IteratorResult<Buffer>>();

      stream.once('error', reject);

      try {
        Promise.resolve(iterator.next()).then(resolve, reject);
        const result = await promise;

        if (result.done) {
          break;
        }

        bl.append(result.value);
      } catch (err: any) {
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
            await new Promise<void>((resolve, reject) => {
              const onError = (err: Error) => {
                stream.removeListener('drain', onDrain);

                reject(err);
              };

              const onDrain = () => {
                stream.removeListener('error', onError);

                resolve();
              };

              stream.once('drain', onDrain);
              stream.once('error', onError);
            });
          }
        }

        throw err;
      } finally {
        stream.removeListener('error', reject);
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
          await new Promise<void>((resolve, reject) => {
            const onError = (err: Error) => {
              stream.removeListener('drain', onDrain);

              reject(err);
            };

            const onDrain = () => {
              stream.removeListener('error', onError);

              resolve();
            };

            stream.once('drain', onDrain);
            stream.once('error', onError);
          });
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
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => {
          stream.removeListener('drain', onDrain);

          reject(err);
        };

        const onDrain = () => {
          stream.removeListener('error', onError);

          resolve();
        };

        stream.once('drain', onDrain);
        stream.once('error', onError);
      });
    }
  }

  /**
   * Read the next incoming message from the socket.
   *
   * Returns a generator that yields `Buffer`s of the incoming message.
   *
   * If there's an error on the stream (e.g. connection is closed unexpectedly),
   * this will throw an error.
   */
  readMessage(): AsyncGenerator<Buffer, void, unknown> {
    const stream = this.tlsNegotiationComplete ? this.securePair!.cleartext : this.socket;
    return MessageIO.readMessage(stream, this.debug);
  }

  static async *readMessage(stream: Readable, debug: Debug) {
    if (!stream.readable) {
      throw new Error('Premature close');
    }

    const bl = new BufferList();

    let error;
    const onError = (err: Error) => {
      error = err;
    };

    const onClose = () => {
      error ??= new Error('Premature close');
    };

    stream.once('error', onError);
    stream.once('close', onClose);

    try {
      while (true) {
        const { promise, resolve, reject } = withResolvers<void>();

        stream.addListener('close', resolve);
        stream.addListener('readable', resolve);
        stream.addListener('error', reject);

        try {
          await promise;
        } finally {
          stream.removeListener('close', resolve);
          stream.removeListener('readable', resolve);
          stream.removeListener('error', reject);
        }

        // Did the stream error while we waited for it to become readable?
        if (error) {
          throw error;
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

            if (bl.length >= length) {
              const data = bl.slice(0, length);
              bl.consume(length);

              // TODO: Get rid of creating `Packet` instances here.
              const packet = new Packet(data);
              debug.packet('Received', packet);
              debug.data(packet);

              yield packet.data();

              // Did the stream error while we yielded?
              if (error) {
                throw error;
              }

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
      stream.removeListener('close', onClose);
      stream.removeListener('error', onError);
    }
  }
}

export default MessageIO;
module.exports = MessageIO;
