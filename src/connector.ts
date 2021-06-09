import net from 'net';
import dns from 'dns';

import * as punycode from 'punycode';

class AbortError extends Error {
  code: string;

  constructor() {
    super('The operation was aborted');

    this.code = 'ABORT_ERR';
    this.name = 'AbortError';
  }
}

export class ParallelConnectionStrategy {
  addresses: dns.LookupAddress[];
  options: { port: number, localAddress?: string };
  signal: AbortSignal;

  constructor(addresses: dns.LookupAddress[], signal: AbortSignal, options: { port: number, localAddress?: string }) {
    this.addresses = addresses;
    this.options = options;
    this.signal = signal;
  }

  connect(callback: (err: Error | null, socket?: net.Socket) => void) {
    const signal = this.signal;
    if (signal.aborted) {
      return process.nextTick(callback, new AbortError());
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

        callback(new Error('Could not connect (parallel)'));
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

      callback(null, this);
    }

    const onAbort = () => {
      for (let j = 0; j < sockets.length; j++) {
        const socket = sockets[j];

        socket.removeListener('error', onError);
        socket.removeListener('connect', onConnect);

        socket.destroy();
      }

      callback(new AbortError());
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

  connect(callback: (err: Error | null, socket?: net.Socket) => void) {
    if (this.signal.aborted) {
      return process.nextTick(callback, new AbortError());
    }

    const next = this.addresses.shift();
    if (!next) {
      return callback(new Error('Could not connect (sequence)'));
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

      callback(new AbortError());
    };

    const onError = (_err: Error) => {
      this.signal.removeEventListener('abort', onAbort);

      socket.removeListener('error', onError);
      socket.removeListener('connect', onConnect);

      socket.destroy();

      this.connect(callback);
    };

    const onConnect = () => {
      this.signal.removeEventListener('abort', onAbort);

      socket.removeListener('error', onError);
      socket.removeListener('connect', onConnect);

      callback(null, socket);
    };

    this.signal.addEventListener('abort', onAbort, { once: true });

    socket.on('error', onError);
    socket.on('connect', onConnect);
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

  execute(cb: (err: Error | null, socket?: net.Socket) => void) {
    if (this.signal.aborted) {
      return process.nextTick(cb, new AbortError());
    }

    this.lookupAllAddresses(this.options.host, (err, addresses) => {
      if (this.signal.aborted) {
        return cb(new AbortError());
      }

      if (err) {
        return cb(err);
      }

      if (this.multiSubnetFailover) {
        new ParallelConnectionStrategy(addresses, this.signal, this.options).connect(cb);
      } else {
        new SequentialConnectionStrategy(addresses, this.signal, this.options).connect(cb);
      }
    });
  }

  lookupAllAddresses(host: string, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
    if (net.isIPv6(host)) {
      process.nextTick(callback, null, [{ address: host, family: 6 }]);
    } else if (net.isIPv4(host)) {
      process.nextTick(callback, null, [{ address: host, family: 4 }]);
    } else {
      this.lookup.call(null, punycode.toASCII(host), { all: true }, callback);
    }
  }
}
