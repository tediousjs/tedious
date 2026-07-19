import DuplexPair from 'native-duplexpair';

import BufferList from 'bl';
import { Duplex, type Readable, type Writable } from 'stream';
import * as tls from 'tls';
import { isIP, Socket } from 'net';
import { EventEmitter } from 'events';

import Debug from './debug';

import Message from './message';
import { HEADER_LENGTH, OFFSET, Packet, STATUS, TYPE } from './packet';
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
 * If the given `cancelSignal` is aborted, the remaining payload is discarded
 * and the message is terminated with the `IGNORE` flag set, telling the
 * server to disregard it. This is a normal protocol outcome: the returned
 * promise resolves, the TDS stream stays aligned, and the server will send a
 * (short) response to the ignored message. Callers can check
 * `cancelSignal.aborted` to distinguish this from a fully sent message.
 *
 * If the given `signal` is aborted, writing stops and the signal's abort
 * reason is thrown. Note that this can leave a partially written message on
 * the stream, so it must only be used when the connection is being torn down
 * anyway. When both signals are aborted, `signal` wins.
 *
 * @param stream The stream to write the message to.
 * @param packetSize The maximum packet size to use.
 * @param type The type of the message to write.
 * @param payload The payload to write.
 * @param options.debug A debug instance to log packets to.
 * @param options.resetConnection Whether the server should reset the connection when processing the message.
 * @param options.cancelSignal An abort signal to cancel the message while keeping the connection usable.
 * @param options.signal An abort signal to stop writing the message during connection teardown.
 */
export async function writeMessage(stream: Writable, packetSize: number, type: number, payload: AsyncIterable<Buffer> | Iterable<Buffer>, options: { debug?: Debug, resetConnection?: boolean, cancelSignal?: AbortSignal, signal?: AbortSignal } = {}): Promise<void> {
  const { debug, resetConnection = false, cancelSignal, signal } = options;

  signal?.throwIfAborted();

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

  // A promise that rejects when the stream errors out or is closed before
  // the message was fully written. It is raced against every wait below, so
  // that a stream failure can neither leave the writer stuck nor let it
  // resolve successfully with an incompletely written message.
  const { promise: failurePromise, reject: rejectWithFailure } = Promise.withResolvers<never>();

  // Prevent unhandled rejections if the stream fails while nothing is
  // currently racing against `failurePromise`.
  failurePromise.catch(() => {});

  const onError = (err: Error) => {
    rejectWithFailure(err);
  };

  const onClose = () => {
    rejectWithFailure(new Error('Premature close'));
  };

  let abortPromise: Promise<never> | null = null;
  let onAbort: (() => void) | null = null;

  if (signal) {
    const { promise, reject } = Promise.withResolvers<never>();

    // Prevent unhandled rejections if the signal is aborted while
    // nothing is currently racing against `abortPromise`.
    promise.catch(() => {});

    abortPromise = promise;
    onAbort = () => { reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
  }

  // Cancellation follows the same pattern as the other signals: the promise
  // is only a wakeup for pending waits, while the `canceled` flag carries the
  // state. `onCancel` sets the flag before resolving, so whenever the wakeup
  // wins a race, the flag is already observable.
  let canceled = cancelSignal?.aborted ?? false;
  let cancelPromise: Promise<void> | null = null;
  let onCancel: (() => void) | null = null;

  if (cancelSignal && !canceled) {
    const { promise, resolve } = Promise.withResolvers<void>();

    cancelPromise = promise;
    onCancel = () => {
      canceled = true;
      resolve();
    };
    cancelSignal.addEventListener('abort', onCancel, { once: true });
  }

  const waitForDrain = () => {
    drain = Promise.withResolvers();

    const contenders: Promise<unknown>[] = [drain.promise, failurePromise];
    if (abortPromise) {
      contenders.push(abortPromise);
    }
    if (cancelPromise) {
      contenders.push(cancelPromise);
    }
    return Promise.race(contenders);
  };

  stream.on('drain', onDrain);
  stream.on('close', onClose);
  stream.on('error', onError);

  let iterator: Iterator<Buffer> | AsyncIterator<Buffer> | null = null;
  let payloadConsumed = false;

  try {
    const bl = new BufferList();
    const length = packetSize - HEADER_LENGTH;
    let packetNumber = 0;

    const baseStatus = resetConnection ? STATUS.RESETCONNECTION : STATUS.NORMAL;

    // Build a packet buffer in a single allocation, copying the packet data
    // directly out of the buffered payload. This avoids the double copy
    // (buffer list -> data buffer -> packet buffer) and the extra allocations
    // that building a header-only `Packet` and appending data to it incur.
    const buildPacket = (dataLength: number, status: number) => {
      const buffer = Buffer.allocUnsafe(HEADER_LENGTH + dataLength);
      buffer[OFFSET.Type] = type;
      buffer[OFFSET.Status] = status;
      buffer.writeUInt16BE(HEADER_LENGTH + dataLength, OFFSET.Length);
      buffer.writeUInt16BE(0, OFFSET.SPID);
      buffer[OFFSET.PacketID] = (packetNumber += 1) % 256;
      buffer[OFFSET.Window] = 0;

      if (dataLength) {
        bl.copy(buffer, HEADER_LENGTH, 0, dataLength);
        bl.consume(dataLength);
      }

      return buffer;
    };

    const writePacket = async (buffer: Buffer) => {
      if (debug) {
        const packet = new Packet(buffer);
        debug.packet('Sent', packet);
        debug.data(packet);
      }

      if (stream.write(buffer) === false) {
        await waitForDrain();
      }
    };

    let isAsync;
    if ((payload as AsyncIterable<Buffer>)[Symbol.asyncIterator]) {
      isAsync = true;
      iterator = (payload as AsyncIterable<Buffer>)[Symbol.asyncIterator]();
    } else {
      isAsync = false;
      iterator = (payload as Iterable<Buffer>)[Symbol.iterator]();
    }

    while (!canceled) {
      let value, done;
      try {
        if (!isAsync) {
          // Synchronous payloads can neither stall nor interleave with
          // signal events between chunks, so skip the promise machinery.
          ({ value, done } = (iterator as Iterator<Buffer>).next());
        } else {
          const result = (iterator as AsyncIterator<Buffer>).next();

          const contenders: Promise<unknown>[] = [Promise.resolve(result), failurePromise];
          if (abortPromise) {
            contenders.push(abortPromise);
          }
          if (cancelPromise) {
            contenders.push(cancelPromise);
          }
          const raceResult = await Promise.race(contenders);

          // Cancellation may have fired while we were waiting - either its
          // wakeup won the race, or a chunk arrived in the same tick and
          // would be discarded anyway.
          if (canceled) {
            break;
          }

          // The only resolving contenders are the iterator result and the
          // cancel wakeup, and the latter implies `canceled` - so at this
          // point, the race result is always an iterator result.
          ({ value, done } = raceResult as IteratorResult<Buffer>);
        }
      } catch (err) {
        // The payload errored while being iterated. If the stream is still
        // writable, terminate the message with the `IGNORE` flag set so the
        // server disregards everything sent so far. If the signal was
        // aborted instead, the connection is being torn down and the
        // message is left unterminated.
        if (stream.writable && !signal?.aborted) {
          await writePacket(buildPacket(0, baseStatus | STATUS.EOM | STATUS.IGNORE));
        }

        throw err;
      }

      if (done) {
        payloadConsumed = true;
        break;
      }

      bl.append(value);

      while (!canceled && bl.length > length) {
        await writePacket(buildPacket(length, baseStatus));
      }
    }

    // On cancellation, any buffered payload data is discarded and the final
    // packet is flagged so the server ignores the whole message.
    if (canceled) {
      await writePacket(buildPacket(0, baseStatus | STATUS.EOM | STATUS.IGNORE));
    } else {
      await writePacket(buildPacket(bl.length, baseStatus | STATUS.EOM));
    }
  } finally {
    // If the payload was not fully consumed (cancellation, teardown, or a
    // stream failure), close its iterator so `finally` blocks in generator
    // payloads can release their resources. This is deliberately not
    // awaited: if the payload is currently suspended on a pending `next()`,
    // the `return()` call is queued behind it and only settles once that
    // read settles - awaiting it here could block forever.
    if (iterator && !payloadConsumed && iterator.return) {
      try {
        Promise.resolve(iterator.return()).catch(() => {});
      } catch {
        // Ignore errors from closing the payload iterator.
      }
    }

    stream.removeListener('drain', onDrain);
    stream.removeListener('close', onClose);
    stream.removeListener('error', onError);

    if (signal && onAbort) {
      signal.removeEventListener('abort', onAbort);
    }

    if (cancelSignal && onCancel) {
      cancelSignal.removeEventListener('abort', onCancel);
    }
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
 * The generator must be consumed until the message's last packet: stopping
 * iteration early discards any bytes buffered beyond the last yielded chunk
 * and leaves the TDS stream misaligned. This is also why there is no
 * `cancelSignal` option here - a canceled request still has to read the
 * server's response to its end to keep the stream aligned.
 *
 * If the given `signal` is aborted, reading stops and the signal's abort
 * reason is thrown. This also interrupts waiting for more data on a quiet
 * stream, which an external `.return()` or `.throw()` call can not do (it
 * would be queued behind the pending read).
 *
 * @param stream The stream to read the message from.
 * @param options.debug A debug instance to log packets to.
 * @param options.signal An abort signal to stop reading the message.
 */
export async function* readMessage(stream: Readable, options: { debug?: Debug, signal?: AbortSignal } = {}): AsyncGenerator<Buffer, void, undefined> {
  const { debug, signal } = options;

  signal?.throwIfAborted();

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

  let onAbort: (() => void) | null = null;
  if (signal) {
    onAbort = () => {
      error ??= signal.reason;

      if (waiting) {
        const { reject } = waiting;
        waiting = null;
        reject(signal.reason);
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });
  }

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

          if (debug) {
            const packet = new Packet(data);
            debug.packet('Received', packet);
            debug.data(packet);
          }

          yield data.subarray(HEADER_LENGTH);

          // Did the stream error out or close while we yielded? The events
          // have already fired, so the wait below would never settle.
          if (error) {
            throw error;
          }

          if (closed) {
            throw new Error('Premature close');
          }

          if (data[OFFSET.Status] & STATUS.EOM) {
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

    if (signal && onAbort) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

export default MessageIO;
module.exports = MessageIO;
// The `module.exports` assignment above replaces the named exports on the
// CommonJS side, so re-attach them.
module.exports.writeMessage = writeMessage;
module.exports.readMessage = readMessage;
