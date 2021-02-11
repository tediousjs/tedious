import dgram from 'dgram';
import dns from 'dns';
import net from 'net';
import * as punycode from 'punycode';

import AbortError from './errors/abort-error';

type LookupFunction = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => void;


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

  send(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const signal = this.signal;

      if (signal.aborted) {
        return reject(new AbortError());
      }

      const sockets: dgram.Socket[] = [];

      let errorCount = 0;

      const onError = (err: Error) => {
        errorCount++;

        if (errorCount === this.addresses.length) {
          signal.removeEventListener('abort', onAbort);
          clearSockets();

          reject(err);
        }
      };

      const onMessage = (message: Buffer) => {
        signal.removeEventListener('abort', onAbort);
        clearSockets();

        resolve(message);
      };

      const onAbort = () => {
        clearSockets();

        reject(new AbortError());
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
    });
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

  execute(): Promise<Buffer> {
    if (net.isIP(this.host)) {
      return this.executeForIP();
    } else {
      return this.executeForHostname();
    }
  }

  executeForIP(): Promise<Buffer> {
    return this.executeForAddresses([
      { address: this.host, family: net.isIPv6(this.host) ? 6 : 4 }
    ]);
  }

  // Wrapper for stubbing. Sinon does not have support for stubbing module functions.
  invokeLookupAll(host: string): Promise<dns.LookupAddress[]> {
    return new Promise((resolve, reject) => {
      this.lookup.call(null, punycode.toASCII(host), { all: true }, (err, addresses) => {
        err ? reject(err) : resolve(addresses);
      });
    });
  }

  async executeForHostname(): Promise<Buffer> {
    const addresses = await this.invokeLookupAll(this.host);
    return this.executeForAddresses(addresses);
  }

  executeForAddresses(addresses: dns.LookupAddress[]): Promise<Buffer> {
    const parallelSendStrategy = new ParallelSendStrategy(addresses, this.port, this.signal, this.request);
    return parallelSendStrategy.send();
  }
}
