import net from 'net';
import dns from 'dns';

import * as punycode from 'punycode';
import AbortError from './errors/abort-error';

export class ParallelConnectionStrategy {
  addresses: dns.LookupAddress[];
  options: { port: number, localAddress?: string };
  signal: AbortSignal;

  constructor(addresses: dns.LookupAddress[], signal: AbortSignal, options: { port: number, localAddress?: string }) {
    this.addresses = addresses;
    this.options = options;
    this.signal = signal;
  }

  connect(): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const signal = this.signal;
      if (signal.aborted) {
        return reject(new AbortError());
      }

      const addresses = this.addresses;
      const sockets = new Array(addresses.length);

      let errorCount = 0;
      function onError(this: net.Socket, _err: Error) {
        errorCount += 1;

        this.removeListener('error', onError);
        this.removeListener('connect', onConnect);

        this.destroy();

        if (errorCount === addresses.length) {
          signal.removeEventListener('abort', onAbort);

          reject(new Error('Could not connect (parallel)'));
        }
      }

      function onConnect(this: net.Socket) {
        signal.removeEventListener('abort', onAbort);

        for (let j = 0; j < sockets.length; j++) {
          const socket = sockets[j];

          if (this === socket) {
            continue;
          }

          socket.removeListener('error', onError);
          socket.removeListener('connect', onConnect);
          socket.destroy();
        }

        resolve(this);
      }

      const onAbort = () => {
        for (let j = 0; j < sockets.length; j++) {
          const socket = sockets[j];

          socket.removeListener('error', onError);
          socket.removeListener('connect', onConnect);

          socket.destroy();
        }

        reject(new AbortError());
      };

      for (let i = 0, len = addresses.length; i < len; i++) {
        const socket = sockets[i] = net.connect({
          ...this.options,
          host: addresses[i].address,
          family: addresses[i].family
        });

        socket.on('error', onError);
        socket.on('connect', onConnect);
      }

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}

export class SequentialConnectionStrategy {
  addresses: dns.LookupAddress[];
  options: { port: number, localAddress?: string };
  signal: AbortSignal;

  constructor(addresses: dns.LookupAddress[], signal: AbortSignal, options: { port: number, localAddress?: string }) {
    this.addresses = addresses;
    this.options = options;
    this.signal = signal;
  }

  connect(): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      if (this.signal.aborted) {
        return reject(new AbortError());
      }

      const next = this.addresses.shift();
      if (!next) {
        return reject(new Error('Could not connect (sequence)'));
      }

      const socket = net.connect({
        ...this.options,
        host: next.address,
        family: next.family
      });

      const onAbort = () => {
        socket.removeListener('error', onError);
        socket.removeListener('connect', onConnect);

        socket.destroy();

        reject(new AbortError());
      };

      const onError = (_err: Error) => {
        this.signal.removeEventListener('abort', onAbort);

        socket.removeListener('error', onError);
        socket.removeListener('connect', onConnect);

        socket.destroy();

        resolve(this.connect());
      };

      const onConnect = () => {
        this.signal.removeEventListener('abort', onAbort);

        socket.removeListener('error', onError);
        socket.removeListener('connect', onConnect);

        resolve(socket);
      };

      this.signal.addEventListener('abort', onAbort, { once: true });

      socket.on('error', onError);
      socket.on('connect', onConnect);
    });
  }
}

type LookupFunction = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => void;

export class Connector {
  options: { port: number, host: string, localAddress?: string };
  multiSubnetFailover: boolean;
  lookup: LookupFunction;
  signal: AbortSignal;

  constructor(options: { port: number, host: string, localAddress?: string, lookup?: LookupFunction }, signal: AbortSignal, multiSubnetFailover: boolean) {
    this.options = options;
    this.lookup = options.lookup ?? dns.lookup;
    this.signal = signal;
    this.multiSubnetFailover = multiSubnetFailover;
  }

  async execute(): Promise<net.Socket> {
    if (this.signal.aborted) {
      throw new AbortError();
    }

    const addresses = await this.lookupAllAddresses(this.options.host);

    let strategy;
    if (this.multiSubnetFailover) {
      strategy = new ParallelConnectionStrategy(addresses, this.signal, this.options);
    } else {
      strategy = new SequentialConnectionStrategy(addresses, this.signal, this.options);
    }

    return strategy.connect();
  }

  lookupAllAddresses(host: string): Promise<dns.LookupAddress[]> {
    if (net.isIPv6(host)) {
      return Promise.resolve([{ address: host, family: 6 }]);
    } else if (net.isIPv4(host)) {
      return Promise.resolve([{ address: host, family: 4 }]);
    } else {
      return new Promise((resolve, reject) => {
        this.lookup.call(null, punycode.toASCII(host), { all: true }, (err, addresses) => {
          if (this.signal.aborted) {
            return reject(new AbortError());
          }

          err ? reject(err) : resolve(addresses);
        });
      });
    }
  }
}
