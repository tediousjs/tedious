import { Duplex } from 'stream';
import { type Socket } from 'net';

/**
 * The stream that the TLS layer of a connection with `encrypt: true` reads
 * from and writes to.
 *
 * TDS negotiates TLS inside `PRELOGIN` messages: during the handshake, the
 * TLS data is sent to the server as the payload of a `PRELOGIN` message, and
 * the payload of the server's response is handed back to the TLS layer. Once
 * the handshake completed (see `startPassthrough`), the TLS data is
 * exchanged with the socket as is.
 */
export class TlsBridge extends Duplex {
  declare socket: Socket;

  // Sends handshake data to the server, and resolves to its response.
  declare exchangeHandshakeData: (data: Buffer) => Promise<Buffer>;

  // Handshake data that was not sent yet.
  declare handshakeData: Buffer[];

  // Whether sending the handshake data was scheduled.
  declare exchangeScheduled: boolean;

  // Whether handshake data was sent, and the response did not arrive yet.
  declare exchanging: boolean;

  declare passthrough: boolean;

  // The callback of a write that waits for the socket to drain.
  declare pendingWriteCallback: (() => void) | undefined;

  declare onSocketData: (data: Buffer) => void;
  declare onSocketEnd: () => void;
  declare onSocketDrain: () => void;
  declare onSocketClose: () => void;

  constructor(socket: Socket, exchangeHandshakeData: (data: Buffer) => Promise<Buffer>) {
    super();

    this.socket = socket;
    this.exchangeHandshakeData = exchangeHandshakeData;

    this.handshakeData = [];
    this.exchangeScheduled = false;
    this.exchanging = false;
    this.passthrough = false;
    this.pendingWriteCallback = undefined;

    this.onSocketData = (data) => {
      if (!this.push(data)) {
        this.socket.pause();
      }
    };

    this.onSocketEnd = () => {
      this.push(null);
    };

    this.onSocketDrain = () => {
      const callback = this.pendingWriteCallback;
      this.pendingWriteCallback = undefined;
      callback?.();
    };

    // Nothing can be exchanged anymore. (Errors of the socket are handled by
    // the connection.)
    this.onSocketClose = () => {
      this.destroy();
    };
  }

  /**
   * Exchange the TLS data with the socket as is from now on.
   */
  startPassthrough() {
    this.passthrough = true;

    this.socket.on('data', this.onSocketData);
    this.socket.on('end', this.onSocketEnd);
    this.socket.on('drain', this.onSocketDrain);
    this.socket.on('close', this.onSocketClose);
    this.socket.resume();

    if (this.socket.destroyed) {
      this.destroy();
    }
  }

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    if (this.passthrough) {
      if (this.socket.write(chunk)) {
        callback();
      } else {
        this.pendingWriteCallback = callback;
      }
      return;
    }

    // The TLS layer writes the data of one handshake step in one go, which
    // is sent to the server as one message.
    this.handshakeData.push(chunk);
    this.scheduleExchange();
    callback();
  }

  _read() {
    if (this.passthrough) {
      this.socket.resume();
    }
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    this.socket.removeListener('data', this.onSocketData);
    this.socket.removeListener('end', this.onSocketEnd);
    this.socket.removeListener('drain', this.onSocketDrain);
    this.socket.removeListener('close', this.onSocketClose);
    callback(error);
  }

  scheduleExchange() {
    if (this.exchangeScheduled) {
      return;
    }

    this.exchangeScheduled = true;
    process.nextTick(() => {
      this.exchangeScheduled = false;
      this.exchange();
    });
  }

  /**
   * Send the handshake data written so far, and hand the server's response
   * to the TLS layer. The server responds to each message, so the next
   * data is only sent once the response to the previous one arrived.
   */
  exchange() {
    if (this.exchanging || this.handshakeData.length === 0 || this.destroyed) {
      return;
    }

    const data = Buffer.concat(this.handshakeData);
    this.handshakeData = [];
    this.exchanging = true;

    this.exchangeHandshakeData(data).then((response) => {
      this.exchanging = false;
      this.push(response);

      // Data written while waiting for the response.
      if (this.handshakeData.length > 0) {
        this.scheduleExchange();
      }
    }, (error) => {
      this.destroy(error);
    });
  }
}
