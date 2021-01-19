import dgram from 'dgram';
import dns from 'dns';
import net from 'net';
import * as punycode from 'punycode';

type LookupFunction = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => void;

class AbortError extends Error {
  code: string;

  constructor() {
    super('The operation was aborted');

    this.code = 'ABORT_ERR';
    this.name = 'AbortError';
  }
}

export class ParallelSendStrategy {
  addresses: dns.LookupAddress[];
  port: number;
  request: Buffer;

  signal: AbortSignal;

  constructor(addresses: dns.LookupAddress[], port: number, signal: AbortSignal, request: Buffer) {
    this.addresses = addresses;
    this.port = port;
    this.request = request;
    this.signal = signal;
  }

  send(cb: (error: Error | null, message?: Buffer) => void) {
    const signal = this.signal;

    if (signal.aborted) {
      return cb(new AbortError());
    }

    const sockets: dgram.Socket[] = [];

    let errorCount = 0;

    const onError = (err: Error) => {
      errorCount++;

      if (errorCount === this.addresses.length) {
        signal.removeEventListener('abort', onAbort);
        clearSockets();

        cb(err);
      }
    };

    const onMessage = (message: Buffer) => {
      signal.removeEventListener('abort', onAbort);
      clearSockets();

      cb(null, message);
    };

    const onAbort = () => {
      clearSockets();

      cb(new AbortError());
    };

    const clearSockets = () => {
      for (const socket of sockets) {
        socket.removeListener('error', onError);
        socket.removeListener('message', onMessage);
        socket.close();
      }
    };

    signal.addEventListener('abort', onAbort, { once: true });

    for (let j = 0; j < this.addresses.length; j++) {
      const udpType = this.addresses[j].family === 6 ? 'udp6' : 'udp4';

      const socket = dgram.createSocket(udpType);
      sockets.push(socket);
      socket.on('error', onError);
      socket.on('message', onMessage);
      socket.send(this.request, 0, this.request.length, this.port, this.addresses[j].address);
    }
  }
}

export class Sender {
  host: string;
  port: number;
  request: Buffer;
  lookup: LookupFunction;
  signal: AbortSignal;

  constructor(host: string, port: number, lookup: LookupFunction, signal: AbortSignal, request: Buffer) {
    this.host = host;
    this.port = port;
    this.request = request;
    this.lookup = lookup;
    this.signal = signal;
  }

  execute(cb: (error: Error | null, message?: Buffer) => void) {
    if (net.isIP(this.host)) {
      this.executeForIP(cb);
    } else {
      this.executeForHostname(cb);
    }
  }

  executeForIP(cb: (error: Error | null, message?: Buffer) => void) {
    this.executeForAddresses([{ address: this.host, family: net.isIPv6(this.host) ? 6 : 4 }], cb);
  }

  // Wrapper for stubbing. Sinon does not have support for stubbing module functions.
  invokeLookupAll(host: string, cb: (error: Error | null, addresses?: dns.LookupAddress[]) => void) {
    this.lookup.call(null, punycode.toASCII(host), { all: true }, cb);
  }

  executeForHostname(cb: (error: Error | null, message?: Buffer) => void) {
    this.invokeLookupAll(this.host, (err, addresses) => {
      if (err) {
        return cb(err);
      }

      this.executeForAddresses(addresses!, cb);
    });
  }

  executeForAddresses(addresses: dns.LookupAddress[], cb: (error: Error | null, message?: Buffer) => void) {
    const parallelSendStrategy = new ParallelSendStrategy(addresses, this.port, this.signal, this.request);
    parallelSendStrategy.send(cb);
  }
}
