import dns from 'dns';
import AbortController from 'node-abort-controller';

import { Sender } from './sender';

const SQL_SERVER_BROWSER_PORT = 1434;
const TIMEOUT = 2 * 1000;
const RETRIES = 3;
// There are three bytes at the start of the response, whose purpose is unknown.
const MYSTERY_HEADER_LENGTH = 3;

type LookupFunction = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => void;

class AbortError extends Error {
  code: string;

  constructor() {
    super('The operation was aborted');

    this.code = 'ABORT_ERR';
    this.name = 'AbortError';
  }
}

// Most of the functionality has been determined from from jTDS's MSSqlServerInfo class.
export class InstanceLookup {
  instanceLookup(options: { server: string, instanceName: string, timeout?: number, retries?: number, port?: number, lookup?: LookupFunction, signal: AbortSignal }, callback: (err: Error | undefined, port?: number) => void) {
    const server = options.server;
    if (typeof server !== 'string') {
      throw new TypeError('Invalid arguments: "server" must be a string');
    }

    const instanceName = options.instanceName;
    if (typeof instanceName !== 'string') {
      throw new TypeError('Invalid arguments: "instanceName" must be a string');
    }

    const timeout = options.timeout === undefined ? TIMEOUT : options.timeout;
    if (typeof timeout !== 'number') {
      throw new TypeError('Invalid arguments: "timeout" must be a number');
    }

    const retries = options.retries === undefined ? RETRIES : options.retries;
    if (typeof retries !== 'number') {
      throw new TypeError('Invalid arguments: "retries" must be a number');
    }

    if (options.lookup !== undefined && typeof options.lookup !== 'function') {
      throw new TypeError('Invalid arguments: "lookup" must be a function');
    }
    const lookup = options.lookup ?? dns.lookup;

    if (options.port !== undefined && typeof options.port !== 'number') {
      throw new TypeError('Invalid arguments: "port" must be a number');
    }
    const port = options.port ?? SQL_SERVER_BROWSER_PORT;

    const signal = options.signal;

    if (typeof callback !== 'function') {
      throw new TypeError('Invalid arguments: "callback" must be a function');
    }

    if (signal.aborted) {
      return process.nextTick(callback, new AbortError());
    }

    let retriesLeft = retries;

    const makeAttempt = () => {
      if (retriesLeft >= 0) {
        retriesLeft--;

        const controller = new AbortController();

        const abortCurrentAttempt = () => {
          controller.abort();
        };

        // If the overall instance lookup is aborted,
        // forward the abort to the controller of the current
        // lookup attempt.
        signal.addEventListener('abort', abortCurrentAttempt, { once: true });

        const request = Buffer.from([0x02]);
        const sender = new Sender(options.server, port, lookup, controller.signal, request);
        const timer = setTimeout(abortCurrentAttempt, timeout);
        sender.execute((err, response) => {
          clearTimeout(timer);

          if (err) {
            if (err?.name === 'AbortError') {
              // If the overall instance lookup was aborted,
              // do not perform any further attempts.
              if (signal.aborted) {
                return callback(new AbortError());
              }

              return makeAttempt();
            }

            return callback(new Error('Failed to lookup instance on ' + server + ' - ' + err.message));
          }

          const message = response!.toString('ascii', MYSTERY_HEADER_LENGTH);
          const port = this.parseBrowserResponse(message, instanceName);

          if (port) {
            callback(undefined, port);
          } else {
            callback(new Error('Port for ' + instanceName + ' not found in ' + options.server));
          }
        });
      } else {
        callback(new Error('Failed to get response from SQL Server Browser on ' + server));
      }
    };

    makeAttempt();
  }

  parseBrowserResponse(response: string, instanceName: string) {
    let getPort;

    const instances = response.split(';;');
    for (let i = 0, len = instances.length; i < len; i++) {
      const instance = instances[i];
      const parts = instance.split(';');

      for (let p = 0, partsLen = parts.length; p < partsLen; p += 2) {
        const name = parts[p];
        const value = parts[p + 1];

        if (name === 'tcp' && getPort) {
          const port = parseInt(value, 10);
          return port;
        }

        if (name === 'InstanceName') {
          if (value.toUpperCase() === instanceName.toUpperCase()) {
            getPort = true;
          } else {
            getPort = false;
          }
        }
      }
    }
  }
}
