import { type AddressInfo, createConnection, createServer, Server, Socket } from 'net';
import { getEventListeners, once } from 'events';
import { assert } from 'chai';
import { promisify } from 'util';
import DuplexPair from 'native-duplexpair';
import { checkServerIdentity, type PeerCertificate, TLSSocket } from 'tls';
import { readFileSync } from 'fs';
import { Duplex, Readable } from 'stream';
import BufferListStream from 'bl';

import Debug from '../../src/debug';
import MessageIO, { readMessage, writeMessage } from '../../src/message-io';
import Message from '../../src/message';
import { Packet, TYPE } from '../../src/packet';
import { ConnectionError } from '../../src/errors';

const packetType = 2;
const packetSize = 8 + 4;

const delay = promisify(setTimeout);

function assertNoDanglingEventListeners(stream: Duplex) {
  assert.strictEqual(stream.listenerCount('error'), 0);
  assert.strictEqual(stream.listenerCount('drain'), 0);
  assert.strictEqual(stream.listenerCount('readable'), 0);
}

function splitPackets(data: Buffer): Packet[] {
  const packets = [];

  let offset = 0;
  while (offset < data.length) {
    const length = data.readUInt16BE(offset + 2);
    packets.push(new Packet(data.subarray(offset, offset + length)));
    offset += length;
  }

  return packets;
}

describe('writeMessage', function() {
  it('wraps the given payload into a TDS packet and writes it to the given stream', async function() {
    const payload = Buffer.from([1, 2, 3]);
    const stream = new BufferListStream();

    await writeMessage(stream, packetSize, packetType, [payload]);

    const buf = stream.read();
    assert.instanceOf(buf, Buffer);

    const packet = new Packet(buf);
    assert.strictEqual(packet.type(), packetType);
    assert.strictEqual(packet.length(), payload.length + 8);
    assert.isTrue(packet.isLast());
    assert.deepEqual(packet.data(), payload);

    assert.isNull(stream.read());
    assertNoDanglingEventListeners(stream);
  });

  it('splits payloads that are larger than the packet size across multiple packets', async function() {
    const payload = Buffer.from([1, 2, 3, 4, 5, 6]);
    const stream = new BufferListStream();

    // `packetSize` allows for 4 bytes of data per packet
    await writeMessage(stream, packetSize, packetType, [payload]);

    const [firstPacket, secondPacket, ...rest] = splitPackets(stream.read());
    assert.lengthOf(rest, 0);

    assert.strictEqual(firstPacket.packetId(), 1);
    assert.isFalse(firstPacket.isLast());
    assert.deepEqual(firstPacket.data(), payload.subarray(0, 4));

    assert.strictEqual(secondPacket.packetId(), 2);
    assert.isTrue(secondPacket.isLast());
    assert.deepEqual(secondPacket.data(), payload.subarray(4));
  });

  it('writes an empty final packet for an empty payload', async function() {
    const stream = new BufferListStream();

    await writeMessage(stream, packetSize, packetType, []);

    const packet = new Packet(stream.read());
    assert.isTrue(packet.isLast());
    assert.deepEqual(packet.data(), Buffer.alloc(0));

    assert.isNull(stream.read());
  });

  it('terminates the message with the ignore flag set when iterating the payload errors', async function() {
    const payload = Buffer.from([1, 2, 3, 4, 5, 6]);
    const stream = new BufferListStream();

    let hadError = false;
    try {
      await writeMessage(stream, packetSize, packetType, (async function*() {
        yield payload;
        throw new Error('iteration error');
      })());
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'iteration error');
    }

    assert(hadError);

    const [firstPacket, lastPacket, ...rest] = splitPackets(stream.read());
    assert.lengthOf(rest, 0);

    // The part of the payload that filled a whole packet was sent before the
    // error occurred, the rest is discarded.
    assert.isFalse(firstPacket.isLast());
    assert.deepEqual(firstPacket.data(), payload.subarray(0, 4));

    assert.isTrue(lastPacket.isLast());
    assert.include(lastPacket.statusAsString(), 'IGNORE');
    assert.deepEqual(lastPacket.data(), Buffer.alloc(0));

    assertNoDanglingEventListeners(stream);
  });

  it('handles errors from the payload while the stream is waiting for drain', async function() {
    const payload = Buffer.from([1, 2, 3, 4]);

    const callbacks: Array<() => void> = [];
    const stream = new Duplex({
      write(chunk, encoding, callback) {
        // Collect all callbacks so that we can simulate draining the stream later
        callbacks.push(callback);
      },
      read() {},

      // instantly return false on write requests to indicate that the stream needs to drain
      highWaterMark: 1
    });

    let hadError = false;
    try {
      await writeMessage(stream, packetSize, packetType, (async function*() {
        yield payload;

        // Simulate draining the stream after the exception was thrown
        setTimeout(() => {
          let cb;
          while (cb = callbacks.shift()) {
            cb();
          }
        }, 20);

        throw new Error('iteration error');
      })());
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'iteration error');
    }

    assert(hadError);
    assertNoDanglingEventListeners(stream);
  });

  it('handles errors on the stream during writing', async function() {
    const payload = Buffer.from([1, 2, 3]);
    const stream = new Duplex({
      write(chunk, encoding, callback) {
        callback(new Error('write error'));
      },
      read() {}
    });

    let hadError = false;
    try {
      await writeMessage(stream, packetSize, packetType, [payload]);
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'write error');
    }

    assert(hadError);
    assertNoDanglingEventListeners(stream);
  });

  it('handles errors on the stream while waiting for the stream to drain', async function() {
    const payload = Buffer.from([1, 2, 3]);
    const stream = new Duplex({
      write(chunk, encoding, callback) {
        // never call callback so that the stream never drains
      },
      read() {},

      // instantly return false on write requests to indicate that the stream needs to drain
      highWaterMark: 1
    });

    setTimeout(() => {
      assert(stream.writableNeedDrain);
      stream.destroy(new Error('write error'));
    }, 20);

    let hadError = false;
    try {
      await writeMessage(stream, packetSize, packetType, [payload, payload, payload]);
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'write error');
    }

    assert(hadError);
    assertNoDanglingEventListeners(stream);
  });

  it('handles errors on the stream while waiting for more payload data', async function() {
    const payload = Buffer.from([1, 2, 3]);
    const stream = new Duplex({
      write(chunk, encoding, callback) {
        // never call callback so that the stream never drains
      },
      read() {},

      // instantly return false on write requests to indicate that the stream needs to drain
      highWaterMark: 1
    });

    setTimeout(() => {
      assert(stream.writableNeedDrain);
      stream.destroy(new Error('write error'));
    }, 20);

    let hadError = false;
    try {
      await writeMessage(stream, packetSize, packetType, (async function*() {
        yield payload;
        yield payload;
        yield payload;
      })());
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'write error');
    }

    assert(hadError);
    assertNoDanglingEventListeners(stream);
  });

  it('throws when the given stream is not writable', async function() {
    const stream = new BufferListStream();
    stream.end();

    let hadError = false;
    try {
      await writeMessage(stream, packetSize, packetType, []);
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'Premature close');
    }

    assert(hadError);
  });

  it('terminates the message with the ignore flag set when the given cancel signal is aborted while writing', async function() {
    const payload = Buffer.from([1, 2, 3, 4, 5, 6]);
    const stream = new BufferListStream();

    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 20);

    await writeMessage(stream, packetSize, packetType, (async function*() {
      yield payload;

      // Stall forever, waiting for more data that never arrives.
      await new Promise(() => {});
    })(), { cancelSignal: controller.signal });

    const [firstPacket, lastPacket, ...rest] = splitPackets(stream.read());
    assert.lengthOf(rest, 0);

    // The part of the payload that filled a whole packet was sent before the
    // cancellation, the rest is discarded and the message is terminated with
    // the `IGNORE` flag set.
    assert.isFalse(firstPacket.isLast());
    assert.deepEqual(firstPacket.data(), payload.subarray(0, 4));

    assert.isTrue(lastPacket.isLast());
    assert.include(lastPacket.statusAsString(), 'IGNORE');
    assert.deepEqual(lastPacket.data(), Buffer.alloc(0));

    assertNoDanglingEventListeners(stream);
    assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
  });

  it('writes an ignored message without consuming the payload when the given cancel signal is already aborted', async function() {
    const stream = new BufferListStream();
    const cancelSignal = AbortSignal.abort();

    let payloadConsumed = false;

    await writeMessage(stream, packetSize, packetType, (async function*() {
      payloadConsumed = true;
      yield Buffer.from([1, 2, 3]);
    })(), { cancelSignal });

    assert.isFalse(payloadConsumed);

    const [packet, ...rest] = splitPackets(stream.read());
    assert.lengthOf(rest, 0);

    assert.isTrue(packet.isLast());
    assert.include(packet.statusAsString(), 'IGNORE');
    assert.deepEqual(packet.data(), Buffer.alloc(0));

    assertNoDanglingEventListeners(stream);
  });

  it('stops waiting for the stream to drain when the given cancel signal is aborted', async function() {
    const payload = Buffer.from([1, 2, 3]);
    const stream = new Duplex({
      write(chunk, encoding, callback) {
        // never call callback so that the stream never drains
      },
      read() {},

      // instantly return false on write requests to indicate that the stream needs to drain
      highWaterMark: 1
    });

    const controller = new AbortController();
    setTimeout(() => {
      assert(stream.writableNeedDrain);
      controller.abort();
    }, 20);

    // Resolves normally: the remaining payload is discarded and the
    // `IGNORE`-flagged terminator is written without further drain waits.
    await writeMessage(stream, packetSize, packetType, [payload, payload, payload], { cancelSignal: controller.signal });

    assertNoDanglingEventListeners(stream);
    assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
  });

  it('prefers teardown over cancellation when both signals are aborted', async function() {
    const stream = new BufferListStream();
    const signal = AbortSignal.abort(new Error('teardown'));
    const cancelSignal = AbortSignal.abort();

    let hadError = false;
    try {
      await writeMessage(stream, packetSize, packetType, [Buffer.from([1, 2, 3])], { cancelSignal, signal });
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'teardown');
    }

    assert(hadError);

    // Nothing was written.
    assert.isNull(stream.read());
    assertNoDanglingEventListeners(stream);
  });

  it('throws when the given signal is already aborted', async function() {
    const stream = new BufferListStream();
    const signal = AbortSignal.abort(new Error('canceled'));

    let hadError = false;
    try {
      await writeMessage(stream, packetSize, packetType, [Buffer.from([1, 2, 3])], { signal });
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'canceled');
    }

    assert(hadError);

    // Nothing was written.
    assert.isNull(stream.read());
    assertNoDanglingEventListeners(stream);
  });

  it('stops writing when the given signal is aborted while waiting for the stream to drain', async function() {
    const payload = Buffer.from([1, 2, 3]);
    const stream = new Duplex({
      write(chunk, encoding, callback) {
        // never call callback so that the stream never drains
      },
      read() {},

      // instantly return false on write requests to indicate that the stream needs to drain
      highWaterMark: 1
    });

    const controller = new AbortController();
    setTimeout(() => {
      assert(stream.writableNeedDrain);
      controller.abort(new Error('canceled'));
    }, 20);

    let hadError = false;
    try {
      await writeMessage(stream, packetSize, packetType, [payload, payload, payload], { signal: controller.signal });
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'canceled');
    }

    assert(hadError);
    assertNoDanglingEventListeners(stream);
    assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
  });

  it('stops writing when the given signal is aborted while waiting for more payload data', async function() {
    const payload = Buffer.from([1, 2, 3, 4, 5, 6]);
    const stream = new BufferListStream();

    const controller = new AbortController();
    setTimeout(() => {
      controller.abort(new Error('canceled'));
    }, 20);

    let hadError = false;
    try {
      await writeMessage(stream, packetSize, packetType, (async function*() {
        yield payload;

        // Stall forever, waiting for more data that never arrives.
        await new Promise(() => {});
      })(), { signal: controller.signal });
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'canceled');
    }

    assert(hadError);

    // The part of the payload that filled a whole packet was written, but
    // no `IGNORE` terminator: the message is intentionally left unterminated
    // as the connection is being torn down.
    const packets = splitPackets(stream.read());
    assert.lengthOf(packets, 1);
    assert.isFalse(packets[0].isLast());

    assertNoDanglingEventListeners(stream);
    assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
  });
});

describe('readMessage', function() {
  it('reads a message consisting of a single TDS packet from the given stream', async function() {
    const payload = Buffer.from([1, 2, 3]);
    const packet = new Packet(packetType);
    packet.last(true);
    packet.addData(payload);

    const stream = new BufferListStream();
    stream.write(packet.buffer);

    const chunks = [];
    for await (const chunk of readMessage(stream)) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, [payload]);
    assertNoDanglingEventListeners(stream);
  });

  it('reads a message that spans multiple TDS packets', async function() {
    const payload = Buffer.from([1, 2, 3]);

    const firstPacket = new Packet(packetType);
    firstPacket.addData(payload.subarray(0, 2));

    const lastPacket = new Packet(packetType);
    lastPacket.last(true);
    lastPacket.addData(payload.subarray(2));

    const stream = new BufferListStream();
    stream.write(firstPacket.buffer);
    stream.write(lastPacket.buffer);

    const chunks = [];
    for await (const chunk of readMessage(stream)) {
      chunks.push(chunk);
    }

    assert.deepEqual(Buffer.concat(chunks), payload);
  });

  it('reads packets that arrive in chunks that do not align with packet boundaries', async function() {
    const payload = Buffer.from([1, 2, 3]);

    const firstPacket = new Packet(packetType);
    firstPacket.addData(payload.subarray(0, 2));

    const lastPacket = new Packet(packetType);
    lastPacket.last(true);
    lastPacket.addData(payload.subarray(2));

    const data = Buffer.concat([firstPacket.buffer, lastPacket.buffer]);

    const stream = new Readable({ read() {} });

    // Deliver the data byte by byte.
    for (let i = 0; i < data.length; i++) {
      setTimeout(() => {
        stream.push(data.subarray(i, i + 1));
      }, i);
    }

    const chunks = [];
    for await (const chunk of readMessage(stream)) {
      chunks.push(chunk);
    }

    assert.deepEqual(Buffer.concat(chunks), payload);
  });

  it('pushes bytes that follow the last packet of a message back onto the stream', async function() {
    const payload = Buffer.from([1, 2, 3]);
    const packet = new Packet(packetType);
    packet.last(true);
    packet.addData(payload);

    const trailingBytes = Buffer.from([9, 9, 9, 9]);

    const stream = new BufferListStream();
    stream.write(Buffer.concat([packet.buffer, trailingBytes]));

    const chunks = [];
    for await (const chunk of readMessage(stream)) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, [payload]);
    assert.deepEqual(stream.read(), trailingBytes);
  });

  it('handles errors while reading from the stream', async function() {
    const stream = Readable.from((async function*(): AsyncGenerator<Buffer> {
      throw new Error('read error');
    })());

    let hadError = false;
    try {
      const message = readMessage(stream);
      while (!(await message.next()).done) {
        // Discard the message contents.
      }
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'read error');
    }

    assert(hadError);
  });

  it('throws when the stream is closed before the message was fully read', async function() {
    const packet = new Packet(packetType);
    packet.addData(Buffer.from([1, 2, 3]));

    const stream = new Readable({ read() {} });
    stream.push(packet.buffer);

    setTimeout(() => {
      stream.destroy();
    }, 20);

    let hadError = false;
    try {
      const message = readMessage(stream);
      while (!(await message.next()).done) {
        // Discard the message contents.
      }
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'Premature close');
    }

    assert(hadError);
  });

  it('throws when the stream is closed while a yielded chunk is being processed', async function() {
    const payload = Buffer.from([1, 2, 3]);
    const packet = new Packet(packetType);
    packet.addData(payload);

    const stream = new Readable({ read() {} });
    stream.push(packet.buffer);

    const message = readMessage(stream);

    const { value } = await message.next();
    assert.deepEqual(value, payload);

    // The generator is now suspended at `yield`. Close the stream without
    // an error while the consumer is processing the chunk.
    stream.destroy();
    await once(stream, 'close');

    let hadError = false;
    try {
      await message.next();
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'Premature close');
    }

    assert(hadError);
  });

  it('throws when the given stream is not readable', async function() {
    const stream = new Readable({ read() {} });
    stream.destroy();

    let hadError = false;
    try {
      const message = readMessage(stream);
      while (!(await message.next()).done) {
        // Discard the message contents.
      }
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'Premature close');
    }

    assert(hadError);
  });

  it('throws when the given signal is already aborted', async function() {
    const stream = new BufferListStream();
    const signal = AbortSignal.abort(new Error('canceled'));

    let hadError = false;
    try {
      const message = readMessage(stream, { signal });
      while (!(await message.next()).done) {
        // Discard the message contents.
      }
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'canceled');
    }

    assert(hadError);
    assertNoDanglingEventListeners(stream);
  });

  it('stops reading when the given signal is aborted while waiting for data on a quiet stream', async function() {
    // A stream that stays open but never produces data, like a connection
    // to a server that accepted the connection but never responds.
    const stream = new Readable({ read() {} });

    const controller = new AbortController();
    setTimeout(() => {
      controller.abort(new Error('canceled'));
    }, 20);

    let hadError = false;
    try {
      const message = readMessage(stream, { signal: controller.signal });
      while (!(await message.next()).done) {
        // Discard the message contents.
      }
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'canceled');
    }

    assert(hadError);
    assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
  });

  it('stops reading when the given signal is aborted after a partial message was read', async function() {
    const firstPacket = new Packet(packetType);
    firstPacket.addData(Buffer.from([1, 2, 3]));

    const stream = new Readable({ read() {} });
    stream.push(firstPacket.buffer);

    const controller = new AbortController();
    setTimeout(() => {
      controller.abort(new Error('canceled'));
    }, 20);

    const chunks = [];
    let hadError = false;
    try {
      for await (const chunk of readMessage(stream, { signal: controller.signal })) {
        chunks.push(chunk);
      }
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'canceled');
    }

    assert(hadError);
    assert.deepEqual(chunks, [Buffer.from([1, 2, 3])]);
    assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
  });

  it('settles pending reads when the given signal is aborted, instead of deadlocking on `.return()`', async function() {
    // Regression test: calling `.return()` on the generator while it is
    // suspended waiting for stream data is queued behind the pending
    // `.next()` call and would deadlock. Aborting the signal settles the
    // pending read, after which `.return()` resolves normally.
    const stream = new Readable({ read() {} });

    const controller = new AbortController();
    const message = readMessage(stream, { signal: controller.signal });

    const pendingRead = message.next();

    controller.abort(new Error('canceled'));

    let hadError = false;
    try {
      await pendingRead;
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'canceled');
    }

    assert(hadError);

    // The generator has completed; `.return()` settles immediately.
    assert.deepEqual(await message.return(), { value: undefined, done: true });
    assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
  });

  it('throws when receiving a packet with an invalid length', async function() {
    const invalidPacket = Buffer.alloc(8);
    invalidPacket.writeUInt16BE(4, 2);

    const stream = new BufferListStream();
    stream.write(invalidPacket);

    let hadError = false;
    try {
      const message = readMessage(stream);
      while (!(await message.next()).done) {
        // Discard the message contents.
      }
    } catch (err: any) {
      hadError = true;

      assert.instanceOf(err, ConnectionError);
      assert.strictEqual(err.message, 'Unable to process incoming packet');
    }

    assert(hadError);
    assertNoDanglingEventListeners(stream);
  });
});

describe('MessageIO', function() {
  let server: Server;
  let serverConnection: Socket;
  let clientConnection: Socket;

  let debug: Debug;

  beforeEach(function(done) {
    debug = new Debug();

    server = createServer();
    server.listen(0, done);
  });

  beforeEach(async function() {
    [serverConnection, clientConnection] = await Promise.all([
      new Promise<Socket>((resolve) => {
        server.once('connection', (c) => {
          resolve(c);
        });
      }),

      new Promise<Socket>((resolve) => {
        const c = createConnection((server.address() as AddressInfo).port, 'localhost', () => {
          resolve(c);
        });
      })
    ]);
  });

  afterEach(function() {
    serverConnection.destroy();
    clientConnection.destroy();
  });

  afterEach(function(done) {
    server.close(done);
  });

  describe('#sendMessage', function() {
    it('sends data that is smaller than the current packet length', async function() {
      const payload = Buffer.from([1, 2, 3]);

      await Promise.all([
        // Server side
        (async () => {
          await once(serverConnection, 'readable');

          let chunk: Buffer;
          const chunks = [];

          while (chunk = serverConnection.read()) {
            chunks.push(chunk);
          }

          const data = Buffer.concat(chunks);
          assert.lengthOf(data, 11);
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);
          io.sendMessage(packetType, payload);
        })()
      ]);
    });

    it('sends data that matches the current packet length', async function() {
      const payload = Buffer.from([1, 2, 3, 4]);

      await Promise.all([
        // Server side
        (async () => {
          await once(serverConnection, 'readable');

          let chunk: Buffer;
          const chunks = [];

          while (chunk = serverConnection.read()) {
            chunks.push(chunk);
          }

          const data = Buffer.concat(chunks);
          assert.lengthOf(data, 12);
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);
          io.sendMessage(packetType, payload);
        })()
      ]);
    });

    it('sends data that is larger than the current packet length', async function() {
      const payload = Buffer.from([1, 2, 3, 4, 5]);

      await Promise.all([
        // Server side
        (async () => {
          // Wait for data to become available
          await once(serverConnection, 'readable');

          let chunk: Buffer;
          const chunks = [];

          while (chunk = serverConnection.read()) {
            chunks.push(chunk);
          }

          const data = Buffer.concat(chunks);
          assert.lengthOf(data, 21);
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);
          io.sendMessage(packetType, payload);
        })()
      ]);
    });
  });

  describe('#readMessage', function() {
    it('reads data that is sent in a single packet', async function() {
      const payload = Buffer.from([1, 2, 3]);

      await Promise.all([
        // Server side
        (async () => {
          const packet = new Packet(packetType);
          packet.last(true);
          packet.addData(payload);

          serverConnection.write(packet.buffer);
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          const message = await io.readMessage();
          assert.instanceOf(message, Message);

          const chunks = [];
          for await (const chunk of message) {
            chunks.push(chunk);
          }

          assert.deepEqual(chunks, [ payload ]);
        })()
      ]);
    });

    it('reads data that is sent in a single packet but split into separate chunks', async function() {
      const payload = Buffer.from([1, 2, 3]);

      await Promise.all([
        // Server side
        (async () => {
          const packet = new Packet(packetType);
          packet.last(true);
          packet.addData(payload);

          serverConnection.write(packet.buffer.slice(0, 4));
          serverConnection.write(packet.buffer.slice(4));
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          const message = await io.readMessage();
          assert.instanceOf(message, Message);

          const chunks = [];
          for await (const chunk of message) {
            chunks.push(chunk);
          }

          assert.deepEqual(chunks, [ payload ]);
        })()
      ]);
    });

    it('reads data that is sent across multiple packets', async function() {
      const payload = Buffer.from([1, 2, 3]);
      const payload1 = payload.slice(0, 2);
      const payload2 = payload.slice(2, 3);

      await Promise.all([
        // Server side
        (async () => {
          let packet = new Packet(packetType);
          packet.addData(payload1);

          serverConnection.write(packet.buffer);

          await delay(5);

          packet = new Packet(packetType);
          packet.last(true);
          packet.addData(payload2);

          serverConnection.write(packet.buffer);
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          const message = await io.readMessage();
          assert.instanceOf(message, Message);

          const receivedData: Buffer[] = [];
          for await (const chunk of message) {
            receivedData.push(chunk);
          }

          assert.deepEqual(receivedData, [
            payload1,
            payload2
          ]);
        })()
      ]);
    });

    it('reads data that is sent across multiple packets, with a chunk containing parts of different packets', async function() {
      const payload = Buffer.from([1, 2, 3]);
      const payload1 = payload.slice(0, 2);
      const payload2 = payload.slice(2, 3);

      await Promise.all([
        // Server side
        (async () => {
          const packet1 = new Packet(packetType);
          packet1.addData(payload.slice(0, 2));

          const packet2 = new Packet(packetType);
          packet2.last(true);
          packet2.addData(payload.slice(2, 4));

          serverConnection.write(packet1.buffer.slice(0, 6));

          await delay(5);

          serverConnection.write(Buffer.concat([packet1.buffer.slice(6), packet2.buffer.slice(0, 4)]));

          await delay(5);

          serverConnection.write(packet2.buffer.slice(4));
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          const message = await io.readMessage();
          assert.instanceOf(message, Message);

          const receivedData: Buffer[] = [];
          for await (const chunk of message) {
            receivedData.push(chunk);
          }

          assert.deepEqual(receivedData, [
            payload1,
            payload2
          ]);
        })(),
      ]);
    });

    it('reads data that is sent across multiple packets, with a chunk containing multiple packets', async function() {
      const payload = Buffer.from([1, 2, 3, 4, 5, 6]);

      await Promise.all([
        // Server side
        (async () => {
          const packet1 = new Packet(packetType);
          packet1.addData(payload.slice(0, 2));

          const packet2 = new Packet(packetType);
          packet2.addData(payload.slice(2, 4));

          const packet3 = new Packet(packetType);
          packet3.last(true);
          packet3.addData(payload.slice(4, 6));

          const allData = Buffer.concat([packet1.buffer, packet2.buffer, packet3.buffer]);
          const data1 = allData.slice(0, 5);
          const data2 = allData.slice(5);

          serverConnection.write(data1);

          await delay(5);

          serverConnection.write(data2);
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          const message = await io.readMessage();
          assert.instanceOf(message, Message);

          const receivedData: Buffer[] = [];
          for await (const chunk of message) {
            receivedData.push(chunk);
          }

          // How the payloads of the individual packets are chunked up by the buffering
          // inside the `IncomingMessageStream` is an implementation detail we don't care
          // about (and it varies across Node.js versions), so only assert on the
          // concatenated data.
          assert.deepEqual(Buffer.concat(receivedData), payload);
        })()
      ]);
    });
  });

  describe('#startTls', function() {
    let securePair: { encrypted: Duplex, cleartext: TLSSocket };

    beforeEach(function() {
      const duplexpair = new DuplexPair();

      securePair = {
        cleartext: new TLSSocket(duplexpair.socket1 as Socket, {
          key: readFileSync('./test/fixtures/localhost.key'),
          cert: readFileSync('./test/fixtures/localhost.crt'),
          isServer: true,
          ciphers: 'ECDHE-RSA-AES128-GCM-SHA256',
          // TDS 7.x only supports TLS versions up to TLS v1.2
          maxVersion: 'TLSv1.2'
        }),
        encrypted: duplexpair.socket2
      };
    });

    afterEach(function() {
      securePair.cleartext.destroy();
      securePair.encrypted.destroy();
    });

    /**
     * Forwards TLS handshake data between the given `MessageIO` and the
     * server side of the secure pair, unwrapping it from / wrapping it into
     * `PRELOGIN` messages.
     */
    async function forwardTlsHandshake(io: MessageIO, rounds: number) {
      for (let i = 0; i < rounds; i++) {
        const message = await io.readMessage();
        for await (const chunk of message) {
          securePair.encrypted.write(chunk);
        }

        await once(securePair.encrypted, 'readable');

        const chunks = [];
        let chunk;
        while (chunk = securePair.encrypted.read()) {
          chunks.push(chunk);
        }

        io.sendMessage(TYPE.PRELOGIN, Buffer.concat(chunks));
      }
    }

    it('performs TLS negotiation', async function() {
      await Promise.all([
        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          await io.startTls({}, 'localhost', true);

          assert(io.tlsNegotiationComplete);
        })(),

        // Server side
        (async () => {
          const io = new MessageIO(serverConnection, packetSize, debug);

          // The server side TLS socket emits a `secure` event
          // once TLS handshaking was completed.
          const onSecure = once(securePair.cleartext, 'secure');

          {
            const message = await io.readMessage();
            for await (const chunk of message) {
              securePair.encrypted.write(chunk);
            }

            await once(securePair.encrypted, 'readable');

            const chunks = [];
            let chunk;
            while (chunk = securePair.encrypted.read()) {
              chunks.push(chunk);
            }

            io.sendMessage(TYPE.PRELOGIN, Buffer.concat(chunks));
          }

          {
            const message = await io.readMessage();
            for await (const chunk of message) {
              securePair.encrypted.write(chunk);
            }

            await once(securePair.encrypted, 'readable');

            const chunks = [];
            let chunk;
            while (chunk = securePair.encrypted.read()) {
              chunks.push(chunk);
            }

            io.sendMessage(TYPE.PRELOGIN, Buffer.concat(chunks));
          }

          // Verify that server side was successful at this point
          await onSecure;
        })()
      ]);
    });

    it('sends and receives data via TLS after successful TLS negotiation', async function() {
      const payload = Buffer.from([1, 2, 3]);

      await Promise.all([
        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          await io.startTls({}, 'localhost', true);

          // Send a request (via TLS)
          io.sendMessage(TYPE.LOGIN7, payload);

          // Receive response (via TLS)
          const message = await io.readMessage();

          const chunks: Buffer[] = [];
          for await (const chunk of message) {
            chunks.push(chunk);
          }

          assert.deepEqual(Buffer.concat(chunks), payload);
        })(),

        // Server side
        (async () => {
          const io = new MessageIO(serverConnection, packetSize, debug);

          // The server side TLS socket emits a `secure` event
          // once TLS handshaking was completed.
          const onSecure = once(securePair.cleartext, 'secure');

          {
            const message = await io.readMessage();
            for await (const chunk of message) {
              securePair.encrypted.write(chunk);
            }

            await once(securePair.encrypted, 'readable');

            const chunks = [];
            let chunk;
            while (chunk = securePair.encrypted.read()) {
              chunks.push(chunk);
            }

            io.sendMessage(TYPE.PRELOGIN, Buffer.concat(chunks));
          }

          {
            const message = await io.readMessage();
            for await (const chunk of message) {
              securePair.encrypted.write(chunk);
            }

            await once(securePair.encrypted, 'readable');

            const chunks = [];
            let chunk;
            while (chunk = securePair.encrypted.read()) {
              chunks.push(chunk);
            }

            io.sendMessage(TYPE.PRELOGIN, Buffer.concat(chunks));
          }

          // Verify that server side was successful at this point
          await onSecure;

          // Set up TLS encryption
          serverConnection.pipe(securePair.encrypted);
          securePair.encrypted.pipe(serverConnection);

          // Wait for client request
          await once(securePair.cleartext, 'readable');

          {
            const chunks: Buffer[] = [];
            let chunk;
            while (chunk = securePair.cleartext.read()) {
              chunks.push(chunk);
            }

            const data = Buffer.concat(chunks);
            assert.lengthOf(data, 11);

            // Send a response
            const packet = new Packet(TYPE.LOGIN7);
            packet.addData(payload);
            packet.last(true);
            securePair.cleartext.write(packet.buffer);
          }
        })()
      ]);
    });

    it('sends the hostname via the SNI extension', async function() {
      await Promise.all([
        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          await io.startTls({}, 'localhost', true);

          assert(io.tlsNegotiationComplete);
        })(),

        // Server side
        (async () => {
          const io = new MessageIO(serverConnection, packetSize, debug);

          const onSecure = once(securePair.cleartext, 'secure');

          await forwardTlsHandshake(io, 2);

          await onSecure;

          assert.strictEqual(securePair.cleartext.servername, 'localhost');
        })()
      ]);
    });

    describe('when connecting to an IP address', function() {
      beforeEach(function() {
        // Replace the server side of the secure pair with one that uses a
        // certificate that carries IP address SANs (and no DNS SANs).
        securePair.cleartext.destroy();
        securePair.encrypted.destroy();

        const duplexpair = new DuplexPair();

        securePair = {
          cleartext: new TLSSocket(duplexpair.socket1 as Socket, {
            key: readFileSync('./test/fixtures/loopback-ip.key'),
            cert: readFileSync('./test/fixtures/loopback-ip.crt'),
            isServer: true,
            ciphers: 'ECDHE-RSA-AES128-GCM-SHA256',
            // TDS 7.x only supports TLS versions up to TLS v1.2
            maxVersion: 'TLSv1.2'
          }),
          encrypted: duplexpair.socket2
        };
      });

      it('omits the SNI extension and validates the certificate against the IPv4 address', async function() {
        await Promise.all([
          // Client side
          (async () => {
            const io = new MessageIO(clientConnection, packetSize, debug);

            await io.startTls({
              ca: [readFileSync('./test/fixtures/loopback-ip.crt')]
            }, '127.0.0.1', false);

            assert(io.tlsNegotiationComplete);
          })(),

          // Server side
          (async () => {
            const io = new MessageIO(serverConnection, packetSize, debug);

            const onSecure = once(securePair.cleartext, 'secure');

            await forwardTlsHandshake(io, 2);

            await onSecure;

            assert.notOk(securePair.cleartext.servername);
          })()
        ]);
      });

      it('omits the SNI extension and validates the certificate against the IPv6 address', async function() {
        // Some Node.js versions are affected by an upstream regression that
        // prevents IPv6 addresses from being matched against `IP Address`
        // SANs. See https://github.com/nodejs/node/issues/64144
        const cert = { subject: { CN: 'dummy' }, subjectaltname: 'IP Address:0:0:0:0:0:0:0:1' };
        if (checkServerIdentity('::1', cert as PeerCertificate) !== undefined) {
          this.skip();
        }

        await Promise.all([
          // Client side
          (async () => {
            const io = new MessageIO(clientConnection, packetSize, debug);

            await io.startTls({
              ca: [readFileSync('./test/fixtures/loopback-ip.crt')]
            }, '::1', false);

            assert(io.tlsNegotiationComplete);
          })(),

          // Server side
          (async () => {
            const io = new MessageIO(serverConnection, packetSize, debug);

            const onSecure = once(securePair.cleartext, 'secure');

            await forwardTlsHandshake(io, 2);

            await onSecure;

            assert.notOk(securePair.cleartext.servername);
          })()
        ]);
      });
    });

    it('handles errors happening before TLS negotiation has sent any data', async function() {
      await Promise.all([
        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          let hadError = false;
          try {
            await io.startTls({
              // Use a cipher that causes an error immediately
              ciphers: 'NULL'
            }, 'localhost', true);
          } catch (err) {
            hadError = true;

            assert.instanceOf(err, Error);
            assert.strictEqual((err as Error & { code?: string }).code, 'ERR_SSL_NO_CIPHERS_AVAILABLE');
            assert.strictEqual((err as Error & { reason?: string }).reason, 'no ciphers available');
          }

          assert(hadError);
        })(),

        // Server side
        (async () => {
          // Does nothing...
        })()
      ]);
    });

    it('handles errors that happen during TLS negotiation', async function() {
      await Promise.all([
        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          let hadError = false;
          try {
            await io.startTls({
              // Use some cipher that's not supported on the server side
              ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256'
            }, 'localhost', true);
          } catch (err: any) {
            hadError = true;

            assert.instanceOf(err, Error);
            // Node.js >= 22 uses 'ERR_SSL_SSL/TLS_ALERT_HANDSHAKE_FAILURE', older versions use 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE'
            assert.include(
              ['ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE', 'ERR_SSL_SSL/TLS_ALERT_HANDSHAKE_FAILURE'],
              (err as Error & { code?: string }).code
            );
            assert.include(
              ['sslv3 alert handshake failure', 'ssl/tls alert handshake failure'],
              (err as Error & { reason?: string }).reason
            );
          }

          assert(hadError);
        })(),

        // Server side
        (async () => {
          const io = new MessageIO(serverConnection, packetSize, debug);

          {
            const message = await io.readMessage();

            for await (const chunk of message) {
              securePair.encrypted.write(chunk);
            }

            await once(securePair.encrypted, 'readable');

            const chunks = [];
            let chunk;
            while (chunk = securePair.encrypted.read()) {
              chunks.push(chunk);
            }

            io.sendMessage(TYPE.PRELOGIN, Buffer.concat(chunks));
          }
        })()
      ]);
    });
  });
});
