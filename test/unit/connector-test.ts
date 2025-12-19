// @ts-expect-error - type definitions are incomplete (missing enable() and constructor)
import Mitm from 'mitm';
import sinon from 'sinon';
import * as dns from 'dns';
import { assert } from 'chai';
import {
  lookupAllAddresses,
  connectInParallel,
  connectInSequence
} from '../../src/connector';

describe('lookupAllAddresses', function() {
  it('test IDN Server name', async function() {
    const lookup = sinon.spy(function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
      callback(null, [{ address: '127.0.0.1', family: 4 }]);
    });

    const server = '本地主机.ad';
    const controller = new AbortController();

    try {
      await lookupAllAddresses(server, lookup, controller.signal);
    } catch {
      // Ignore
    }

    assert.isOk(lookup.called, 'Failed to call `lookup` function for hostname');
    assert.isOk(lookup.calledWithMatch('xn--tiq21tzznxb.ad'), 'Unexpected hostname passed to `lookup`');
  });

  it('test ASCII Server name', async function() {
    const lookup = sinon.spy(function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
      callback(null, [{ address: '127.0.0.1', family: 4 }]);
    });

    const server = 'localhost';
    const controller = new AbortController();

    try {
      await lookupAllAddresses(server, lookup, controller.signal);
    } catch {
      // Ignore
    }

    assert.isOk(lookup.called, 'Failed to call `lookup` function for hostname');
    assert.isOk(lookup.calledWithMatch(server), 'Unexpected hostname passed to `lookup`');
  });

  it('test invalid ASCII Server name', async function() {
    const server = 'http:wrong';
    const controller = new AbortController();

    let actualError: Error | undefined;
    try {
      await lookupAllAddresses(server, dns.lookup, controller.signal);
    } catch (err) {
      actualError = err as Error;
    }

    assert.instanceOf(actualError, Error);
    assert.strictEqual(actualError!.message, 'getaddrinfo ENOTFOUND http:wrong');
  });
});

describe('connectInSequence', function() {
  let mitm: ReturnType<typeof Mitm>;

  beforeEach(function() {
    mitm = new Mitm();
    mitm.enable();
  });

  afterEach(function() {
    mitm.disable();
  });

  it('tries to connect to all addresses in sequence', async function() {
    const controller = new AbortController();

    const attemptedConnections: any[] = [];
    mitm.on('connect', function(socket: any, options: any) {
      attemptedConnections.push(options);

      const expectedConnectionCount = attemptedConnections.length;
      const handler = () => {
        socket.removeListener('connect', handler);
        socket.removeListener('error', handler);

        assert.strictEqual(attemptedConnections.length, expectedConnectionCount);
      };

      socket.on('connect', handler);
      socket.on('error', handler);

      if (options.host !== '127.0.0.4') {
        process.nextTick(() => {
          socket.emit('error', new Error());
        });
      }
    });

    await connectInSequence(
      { host: 'localhost', port: 12345, localAddress: '192.168.0.1' },
      function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
        callback(null, [
          { address: '127.0.0.2', family: 4 },
          { address: '2002:20:0:0:0:0:1:3', family: 6 },
          { address: '127.0.0.4', family: 4 }
        ]);
      },
      controller.signal,
    );

    assert.strictEqual(attemptedConnections.length, 3);

    assert.strictEqual(attemptedConnections[0].host, '127.0.0.2');
    assert.strictEqual(attemptedConnections[0].port, 12345);
    assert.strictEqual(attemptedConnections[0].localAddress, '192.168.0.1');

    assert.strictEqual(attemptedConnections[1].host, '2002:20:0:0:0:0:1:3');
    assert.strictEqual(attemptedConnections[1].port, 12345);
    assert.strictEqual(attemptedConnections[1].localAddress, '192.168.0.1');

    assert.strictEqual(attemptedConnections[2].host, '127.0.0.4');
    assert.strictEqual(attemptedConnections[2].port, 12345);
    assert.strictEqual(attemptedConnections[2].localAddress, '192.168.0.1');
  });

  it('passes the first succesfully connected socket to the callback', async function() {
    const controller = new AbortController();

    let expectedSocket: any;
    mitm.on('connect', function(socket: any, opts: any) {
      if (opts.host !== '127.0.0.4') {
        socket.destroy(new Error());
      } else {
        expectedSocket = socket;
      }
    });

    const socket = await connectInSequence(
      { host: 'localhost', port: 12345, localAddress: '192.168.0.1' },
      function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
        callback(null, [
          { address: '127.0.0.2', family: 4 },
          { address: '2002:20:0:0:0:0:1:3', family: 6 },
          { address: '127.0.0.4', family: 4 }
        ]);
      },
      controller.signal,
    );

    assert.strictEqual(expectedSocket, socket);
  });

  it('only attempts new connections until the first successful connection', async function() {
    const controller = new AbortController();

    const attemptedConnections: any[] = [];

    mitm.on('connect', function(socket: any, options: any) {
      attemptedConnections.push(options);
    });

    await connectInSequence(
      { host: 'localhost', port: 12345, localAddress: '192.168.0.1' },
      function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
        callback(null, [
          { address: '127.0.0.2', family: 4 },
          { address: '2002:20:0:0:0:0:1:3', family: 6 },
          { address: '127.0.0.4', family: 4 }
        ]);
      },
      controller.signal,
    );

    assert.strictEqual(attemptedConnections.length, 1);

    assert.strictEqual(attemptedConnections[0].host, '127.0.0.2');
    assert.strictEqual(attemptedConnections[0].port, 12345);
    assert.strictEqual(attemptedConnections[0].localAddress, '192.168.0.1');
  });

  it('fails if all sequential connections fail', async function() {
    const controller = new AbortController();

    let i = 0;
    mitm.on('connect', function(socket: any) {
      process.nextTick(() => {
        socket.emit('error', new Error(`failed connection #${i += 1}`));
      });
    });

    let error: AggregateError | undefined;
    try {
      await connectInSequence(
        { host: 'localhost', port: 12345, localAddress: '192.168.0.1' },
        function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
          callback(null, [
            { address: '127.0.0.2', family: 4 },
            { address: '2002:20:0:0:0:0:1:3', family: 6 },
            { address: '127.0.0.4', family: 4 }
          ]);
        },
        controller.signal,
      );
    } catch (err) {
      error = err as AggregateError;
    }

    assert.instanceOf(error, AggregateError);
    assert.equal(error!.message, 'Could not connect (sequence)');
    assert.lengthOf(error!.errors, 3);

    assert.instanceOf(error!.errors[0], Error);
    assert.strictEqual(error!.errors[0].message, 'failed connection #1');

    assert.instanceOf(error!.errors[1], Error);
    assert.strictEqual(error!.errors[1].message, 'failed connection #2');

    assert.instanceOf(error!.errors[2], Error);
    assert.strictEqual(error!.errors[2].message, 'failed connection #3');
  });

  it('destroys all sockets except for the first succesfully connected socket', async function() {
    const controller = new AbortController();
    const attemptedSockets: any[] = [];

    mitm.on('connect', function(socket: any, options: any) {
      attemptedSockets.push(socket);

      if (options.host !== '127.0.0.4') {
        process.nextTick(() => {
          socket.emit('error', new Error());
        });
      }
    });

    await connectInSequence(
      { host: 'localhost', port: 12345, localAddress: '192.168.0.1' },
      function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
        callback(null, [
          { address: '127.0.0.2', family: 4 },
          { address: '2002:20:0:0:0:0:1:3', family: 6 },
          { address: '127.0.0.4', family: 4 }
        ]);
      },
      controller.signal,
    );

    assert.isOk(attemptedSockets[0].destroyed);
    assert.isOk(attemptedSockets[1].destroyed);
    assert.isOk(!attemptedSockets[2].destroyed);
  });

  it('will immediately abort when called with an aborted signal', async function() {
    const controller = new AbortController();
    controller.abort();

    mitm.on('connect', () => {
      assert.fail('no connections expected');
    });

    let error: Error | undefined;
    try {
      await connectInSequence(
        { host: 'localhost', port: 12345, localAddress: '192.168.0.1' },
        function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
          callback(null, [
            { address: '127.0.0.2', family: 4 },
            { address: '2002:20:0:0:0:0:1:3', family: 6 },
            { address: '127.0.0.4', family: 4 }
          ]);
        },
        controller.signal,
      );
    } catch (err) {
      error = err as Error;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error!.name, 'AbortError');
  });

  it('can be aborted while trying to connect', async function() {
    const controller = new AbortController();

    const attemptedSockets: any[] = [];
    mitm.on('connect', function(socket: any) {
      attemptedSockets.push(socket);

      process.nextTick(() => {
        controller.abort();
      });
    });

    let error: Error | undefined;
    try {
      await connectInSequence(
        { host: 'localhost', port: 12345, localAddress: '192.168.0.1' },
        function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
          callback(null, [
            { address: '127.0.0.2', family: 4 },
            { address: '2002:20:0:0:0:0:1:3', family: 6 },
            { address: '127.0.0.4', family: 4 }
          ]);
        },
        controller.signal,
      );
    } catch (err) {
      error = err as Error;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error!.name, 'AbortError');

    assert.lengthOf(attemptedSockets, 1);
    assert.isOk(attemptedSockets[0].destroyed);
  });
});

describe('connectInParallel', function() {
  let mitm: ReturnType<typeof Mitm>;

  beforeEach(function() {
    mitm = new Mitm();
    mitm.enable();
  });

  afterEach(function() {
    mitm.disable();
  });

  it('tries to connect to all addresses in parallel', async function() {
    const controller = new AbortController();
    const attemptedConnections: any[] = [];

    mitm.on('connect', function(socket: any, options: any) {
      attemptedConnections.push(options);

      socket.once('connect', function() {
        assert.strictEqual(attemptedConnections.length, 3);
      });
    });

    await connectInParallel(
      { host: 'localhost', port: 12345, localAddress: '192.168.0.1' },
      function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
        callback(null, [
          { address: '127.0.0.2', family: 4 },
          { address: '2002:20:0:0:0:0:1:3', family: 6 },
          { address: '127.0.0.4', family: 4 }
        ]);
      },
      controller.signal,
    );

    assert.strictEqual(attemptedConnections[0].host, '127.0.0.2');
    assert.strictEqual(attemptedConnections[0].port, 12345);
    assert.strictEqual(attemptedConnections[0].localAddress, '192.168.0.1');

    assert.strictEqual(attemptedConnections[1].host, '2002:20:0:0:0:0:1:3');
    assert.strictEqual(attemptedConnections[1].port, 12345);
    assert.strictEqual(attemptedConnections[1].localAddress, '192.168.0.1');

    assert.strictEqual(attemptedConnections[2].host, '127.0.0.4');
    assert.strictEqual(attemptedConnections[2].port, 12345);
    assert.strictEqual(attemptedConnections[2].localAddress, '192.168.0.1');
  });

  it('fails if all parallel connections fail', async function() {
    const controller = new AbortController();

    let i = 0;
    mitm.on('connect', function(socket: any) {
      process.nextTick(() => {
        socket.emit('error', new Error(`failed connection #${i += 1}`));
      });
    });

    let error: AggregateError | undefined;
    try {
      await connectInParallel(
        { host: 'localhost', port: 12345, localAddress: '192.168.0.1' },
        function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
          callback(null, [
            { address: '127.0.0.2', family: 4 },
            { address: '2002:20:0:0:0:0:1:3', family: 6 },
            { address: '127.0.0.4', family: 4 }
          ]);
        },
        controller.signal,
      );
    } catch (err) {
      error = err as AggregateError;
    }

    assert.instanceOf(error, AggregateError);
    assert.equal(error!.message, 'Could not connect (parallel)');
    assert.lengthOf(error!.errors, 3);

    assert.instanceOf(error!.errors[0], Error);
    assert.strictEqual(error!.errors[0].message, 'failed connection #1');

    assert.instanceOf(error!.errors[1], Error);
    assert.strictEqual(error!.errors[1].message, 'failed connection #2');

    assert.instanceOf(error!.errors[2], Error);
    assert.strictEqual(error!.errors[2].message, 'failed connection #3');
  });

  it('passes the first succesfully connected socket to the callback', async function() {
    const controller = new AbortController();

    let expectedSocket: any;
    mitm.on('connect', function(socket: any, opts: any) {
      if (opts.host !== '127.0.0.4') {
        process.nextTick(() => {
          socket.emit('error', new Error());
        });
      } else {
        expectedSocket = socket;
      }
    });

    const socket = await connectInParallel(
      { host: 'localhost', port: 12345, localAddress: '192.168.0.1' },
      function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
        callback(null, [
          { address: '127.0.0.2', family: 4 },
          { address: '2002:20:0:0:0:0:1:3', family: 6 },
          { address: '127.0.0.4', family: 4 }
        ]);
      },
      controller.signal,
    );
    assert.strictEqual(expectedSocket, socket);
  });

  it('destroys all sockets except for the first succesfully connected socket', async function() {
    const controller = new AbortController();
    const attemptedSockets: any[] = [];

    mitm.on('connect', function(socket: any) {
      attemptedSockets.push(socket);
    });

    await connectInParallel(
      { host: 'localhost', port: 12345, localAddress: '192.168.0.1' },
      function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
        callback(null, [
          { address: '127.0.0.2', family: 4 },
          { address: '2002:20:0:0:0:0:1:3', family: 6 },
          { address: '127.0.0.4', family: 4 }
        ]);
      },
      controller.signal,
    );

    assert.isOk(!attemptedSockets[0].destroyed);
    assert.isOk(attemptedSockets[1].destroyed);
    assert.isOk(attemptedSockets[2].destroyed);
  });

  it('will immediately abort when called with an aborted signal', async function() {
    const controller = new AbortController();
    controller.abort();

    mitm.on('connect', () => {
      assert.fail('no connections expected');
    });

    let error: Error | undefined;
    try {
      await connectInParallel(
        { host: 'localhost', port: 12345, localAddress: '192.168.0.1' },
        function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
          callback(null, [
            { address: '127.0.0.2', family: 4 },
            { address: '2002:20:0:0:0:0:1:3', family: 6 },
            { address: '127.0.0.4', family: 4 }
          ]);
        },
        controller.signal,
      );
    } catch (err) {
      error = err as Error;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error!.name, 'AbortError');
  });

  it('can be aborted while trying to connect', async function() {
    const controller = new AbortController();

    const attemptedSockets: any[] = [];
    mitm.on('connect', function(socket: any) {
      attemptedSockets.push(socket);

      process.nextTick(() => {
        controller.abort();
      });
    });

    let error: Error | undefined;
    try {
      await connectInParallel(
        { host: 'localhost', port: 12345, localAddress: '192.168.0.1' },
        function lookup(hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) {
          callback(null, [
            { address: '127.0.0.2', family: 4 },
            { address: '2002:20:0:0:0:0:1:3', family: 6 },
            { address: '127.0.0.4', family: 4 }
          ]);
        },
        controller.signal,
      );
    } catch (err) {
      error = err as Error;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error!.name, 'AbortError');

    assert.lengthOf(attemptedSockets, 3);
    assert.isOk(attemptedSockets[0].destroyed);
    assert.isOk(attemptedSockets[1].destroyed);
    assert.isOk(attemptedSockets[2].destroyed);
  });
});
