import net from 'net';
import dns from 'dns';

import * as punycode from 'punycode';

export class ParallelConnectionStrategy {
  addresses: dns.LookupAddress[];
  options: { port: number, localAddress?: string };

  constructor(addresses: dns.LookupAddress[], options: { port: number, localAddress?: string }) {
    this.addresses = addresses;
    this.options = options;
  }

  connect(callback: (err: Error | null, socket?: net.Socket) => void) {
    const addresses = this.addresses;
    const sockets = new Array(addresses.length);

    let errorCount = 0;
    function onError(this: net.Socket, _err: Error) {
      errorCount += 1;

      this.removeListener('error', onError);
      this.removeListener('connect', onConnect);

      if (errorCount === addresses.length) {
        callback(new Error('Could not connect (parallel)'));
      }
    }

    function onConnect(this: net.Socket) {
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

    for (let i = 0, len = addresses.length; i < len; i++) {
      const socket = sockets[i] = net.connect({
        ...this.options,
        host: addresses[i].address,
        family: addresses[i].family
      });

      socket.on('error', onError);
      socket.on('connect', onConnect);
    }
  }
}

export class SequentialConnectionStrategy {
  addresses: dns.LookupAddress[];
  options: { port: number, localAddress?: string };

  constructor(addresses: dns.LookupAddress[], options: { port: number, localAddress?: string }) {
    this.addresses = addresses;
    this.options = options;
  }

  connect(callback: (err: Error | null, socket?: net.Socket) => void) {
    const next = this.addresses.shift();
    if (!next) {
      return callback(new Error('Could not connect (sequence)'));
    }

    const socket = net.connect({
      ...this.options,
      host: next.address,
      family: next.family
    });

    const onError = (_err: Error) => {
      socket.removeListener('error', onError);
      socket.removeListener('connect', onConnect);

      socket.destroy();

      this.connect(callback);
    };

    const onConnect = () => {
      socket.removeListener('error', onError);
      socket.removeListener('connect', onConnect);

      callback(null, socket);
    };

    socket.on('error', onError);
    socket.on('connect', onConnect);
  }
}

type LookupFunction = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => void;

export class Connector {
  options: { port: number, host: string, localAddress?: string };
  multiSubnetFailover: boolean;
  lookup: LookupFunction;

  constructor(options: { port: number, host: string, localAddress?: string, lookup?: LookupFunction }, multiSubnetFailover: boolean) {
    this.options = options;
    this.lookup = options.lookup ?? dns.lookup;
    this.multiSubnetFailover = multiSubnetFailover;
  }

  execute(cb: (err: Error | null, socket?: net.Socket) => void) {
    this.lookupAllAddresses(this.options.host, (err, addresses) => {
      if (err) {
        return cb(err);
      }

      if (this.multiSubnetFailover) {
        new ParallelConnectionStrategy(addresses, this.options).connect(cb);
      } else {
        new SequentialConnectionStrategy(addresses, this.options).connect(cb);
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
