import dns from 'dns';
import AbortController from 'node-abort-controller';

import AbortError from './errors/abort-error';
import { Sender } from './sender';

const SQL_SERVER_BROWSER_PORT = 1434;
const TIMEOUT = 2 * 1000;
const RETRIES = 3;
// There are three bytes at the start of the response, whose purpose is unknown.
const MYSTERY_HEADER_LENGTH = 3;

type LookupFunction = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => void;

// Most of the functionality has been determined from from jTDS's MSSqlServerInfo class.
export class InstanceLookup {
  async instanceLookup(options: { server: string, instanceName: string, timeout?: number, retries?: number, port?: number, lookup?: LookupFunction, signal: AbortSignal }): Promise<number> {
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

    let retries = options.retries === undefined ? RETRIES : options.retries;
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

    if (signal.aborted) {
      throw new AbortError();
    }

    while (retries >= 0) {
      retries--;

      const controller = new AbortController();

      const abortCurrentAttempt = () => { controller.abort(); };

      // If the overall instance lookup is aborted,
      // forward the abort to the controller of the current
      // lookup attempt.
      signal.addEventListener('abort', abortCurrentAttempt, { once: true });

      const request = Buffer.from([0x02]);
      const sender = new Sender(options.server, port, lookup, controller.signal, request);
      const timer = setTimeout(abortCurrentAttempt, timeout);

      let response;
      try {
        response = await sender.execute();
      } catch (err) {
        clearTimeout(timer);

        if (err?.name === 'AbortError') {
          // If the overall instance lookup was aborted,
          // do not perform any further attempts.
          if (signal.aborted) {
            throw new AbortError();
          }

          continue;
        }

        throw new Error('Failed to lookup instance on ' + server + ' - ' + err.message);
      }

      const message = response.toString('ascii', MYSTERY_HEADER_LENGTH);
      const foundPort = this.parseBrowserResponse(message, instanceName);

      if (foundPort) {
        return foundPort;
      }

      throw new Error('Port for ' + instanceName + ' not found in ' + options.server);
    }

    throw new Error('Failed to get response from SQL Server Browser on ' + server);
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
