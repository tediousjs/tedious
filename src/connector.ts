import net from 'net';
import dns, { type LookupAddress } from 'dns';

import url from 'node:url';
import AbortError from './errors/abort-error';

type LookupFunction = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => void;

export async function connectInParallel(options: { host: string, port: number, localAddress?: string | undefined }, lookup: LookupFunction, signal: AbortSignal) {
  if (signal.aborted) {
    throw new AbortError();
  }

  const addresses = await lookupAllAddresses(options.host, lookup, signal);

  return await new Promise<net.Socket>((resolve, reject) => {
    const sockets = new Array(addresses.length);

    const errors: Error[] = [];

    function onError(this: net.Socket, err: Error) {
      errors.push(err);

      this.removeListener('error', onError);
      this.removeListener('connect', onConnect);

      this.destroy();

      if (errors.length === addresses.length) {
        signal.removeEventListener('abort', onAbort);

        reject(new AggregateError(errors, 'Could not connect (parallel)'));
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
        ...options,
        host: addresses[i].address,
        family: addresses[i].family
      });

      socket.on('error', onError);
      socket.on('connect', onConnect);
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function connectInSequence(options: { host: string, port: number, localAddress?: string | undefined }, lookup: LookupFunction, signal: AbortSignal) {
  if (signal.aborted) {
    throw new AbortError();
  }

  const errors: any[] = [];
  const addresses = await lookupAllAddresses(options.host, lookup, signal);

  for (const address of addresses) {
    try {
      return await new Promise<net.Socket>((resolve, reject) => {
        const socket = net.connect({
          ...options,
          host: address.address,
          family: address.family
        });

        const onAbort = () => {
          socket.removeListener('error', onError);
          socket.removeListener('connect', onConnect);

          socket.destroy();

          reject(new AbortError());
        };

        const onError = (err: Error) => {
          signal.removeEventListener('abort', onAbort);

          socket.removeListener('error', onError);
          socket.removeListener('connect', onConnect);

          socket.destroy();

          reject(err);
        };

        const onConnect = () => {
          signal.removeEventListener('abort', onAbort);

          socket.removeListener('error', onError);
          socket.removeListener('connect', onConnect);

          resolve(socket);
        };

        signal.addEventListener('abort', onAbort, { once: true });

        socket.on('error', onError);
        socket.on('connect', onConnect);
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }

      errors.push(err);

      continue;
    }
  }

  throw new AggregateError(errors, 'Could not connect (sequence)');
}

/**
 * Look up all addresses for the given hostname.
 */
export async function lookupAllAddresses(host: string, lookup: LookupFunction, signal: AbortSignal): Promise<dns.LookupAddress[]> {
  if (signal.aborted) {
    throw new AbortError();
  }

  if (net.isIPv6(host)) {
    return [{ address: host, family: 6 }];
  } else if (net.isIPv4(host)) {
    return [{ address: host, family: 4 }];
  } else {
    return await new Promise<LookupAddress[]>((resolve, reject) => {
      const onAbort = () => {
        reject(new AbortError());
      };

      signal.addEventListener('abort', onAbort);

      const domainInASCII = url.domainToASCII(host);
      lookup(domainInASCII === '' ? host : domainInASCII, { all: true }, (err, addresses) => {
        signal.removeEventListener('abort', onAbort);

        err ? reject(err) : resolve(addresses);
      });
    });
  }
}
