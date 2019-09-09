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
      const socket = sockets[i] = net.connect(Object.create(this.options, {
        host: { value: addresses[i].address }
      }));

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

    const socket = net.connect(Object.create(this.options, {
      host: { value: next.address }
    }));

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

export class Connector {
  options: { port: number, host: string, localAddress?: string };
  multiSubnetFailover: boolean;

  constructor(options: { port: number, host: string, localAddress?: string }, multiSubnetFailover: boolean) {
    this.options = options;
    this.multiSubnetFailover = multiSubnetFailover;
  }

  execute(cb: (err: Error | null, socket?: net.Socket) => void) {
    if (net.isIP(this.options.host)) {
      this.executeForIP(cb);
    } else {
      this.executeForHostname(cb);
    }
  }

  executeForIP(cb: (err: Error | null, socket?: net.Socket) => void) {
    const socket = net.connect(this.options);

    const onError = (err: Error) => {
      socket.removeListener('error', onError);
      socket.removeListener('connect', onConnect);

      socket.destroy();

      cb(err);
    };

    const onConnect = () => {
      socket.removeListener('error', onError);
      socket.removeListener('connect', onConnect);

      cb(null, socket);
    };

    socket.on('error', onError);
    socket.on('connect', onConnect);
  }

  executeForHostname(cb: (err: Error | null, socket?: net.Socket) => void) {
    dns.lookup(punycode.toASCII(this.options.host), { all: true }, (err, addresses) => {
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
}
