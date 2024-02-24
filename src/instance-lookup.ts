import dns from 'dns';

import AbortError from './errors/abort-error';
import { sendMessage } from './sender';
import { withTimeout } from './utils/with-timeout';

const SQL_SERVER_BROWSER_PORT = 1434;
const TIMEOUT = 2 * 1000;
const RETRIES = 3;
// There are three bytes at the start of the response, whose purpose is unknown.
const MYSTERY_HEADER_LENGTH = 3;

type LookupFunction = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => void;

// Most of the functionality has been determined from from jTDS's MSSqlServerInfo class.
export async function instanceLookup(options: { server: string, instanceName: string, timeout?: number, retries?: number, port?: number, lookup?: LookupFunction, signal: AbortSignal }) {
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

  if (signal.aborted) {
    throw new AbortError();
  }

  let response;

  for (let i = 0; i <= retries; i++) {
    try {
      response = await withTimeout(timeout, async (signal) => {
        const request = Buffer.from([0x02]);
        return await sendMessage(options.server, port, lookup, signal, request);
      }, signal);
    } catch (err) {
      // If the current attempt timed out, continue with the next
      if (!signal.aborted && err instanceof Error && err.name === 'TimeoutError') {
        continue;
      }

      throw err;
    }
  }

  if (!response) {
    throw new Error('Failed to get response from SQL Server Browser on ' + server);
  }

  const message = response.toString('ascii', MYSTERY_HEADER_LENGTH);
  const foundPort = parseBrowserResponse(message, instanceName);

  if (!foundPort) {
    throw new Error('Port for ' + instanceName + ' not found in ' + options.server);
  }

  return foundPort;
}

export function parseBrowserResponse(response: string, instanceName: string) {
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
