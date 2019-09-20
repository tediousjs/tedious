import { Sender } from './sender';

const SQL_SERVER_BROWSER_PORT = 1434;
const TIMEOUT = 2 * 1000;
const RETRIES = 3;
// There are three bytes at the start of the response, whose purpose is unknown.
const MYSTERY_HEADER_LENGTH = 3;

// Most of the functionality has been determined from from jTDS's MSSqlServerInfo class.
export class InstanceLookup {
  // Wrapper allows for stubbing Sender when unit testing instance-lookup.
  createSender(host: string, port: number, request: Buffer) {
    return new Sender(host, port, request);
  }

  instanceLookup(options: { server: string, instanceName: string, timeout?: number, retries?: number }, callback: (message: string | undefined, port?: number) => void) {
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

    if (typeof callback !== 'function') {
      throw new TypeError('Invalid arguments: "callback" must be a function');
    }

    let sender: Sender;
    let timer: NodeJS.Timeout;
    let retriesLeft = retries;

    const onTimeout = () => {
      sender.cancel();
      makeAttempt();
    };

    const makeAttempt = () => {
      if (retriesLeft > 0) {
        retriesLeft--;

        const request = Buffer.from([0x02]);
        sender = this.createSender(options.server, SQL_SERVER_BROWSER_PORT, request);
        sender.execute((err, response) => {
          clearTimeout(timer);
          if (err) {
            callback('Failed to lookup instance on ' + server + ' - ' + err.message);

          } else {
            const message = response!.toString('ascii', MYSTERY_HEADER_LENGTH);
            const port = this.parseBrowserResponse(message, instanceName);

            if (port) {
              callback(undefined, port);
            } else {
              callback('Port for ' + instanceName + ' not found in ' + options.server);
            }
          }
        });

        timer = setTimeout(onTimeout, timeout);
      } else {
        callback('Failed to get response from SQL Server Browser on ' + server);
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
