import { assert } from 'chai';
import { PassThrough } from 'stream';

import IncomingMessageReader, { IncomingMessage } from '../../src/incoming-message-reader';
import Debug from '../../src/debug';
import { ConnectionError } from '../../src/errors';

function packet(type: number, data: Buffer, last: boolean) {
  const header = Buffer.alloc(8);
  header.writeUInt8(type, 0);
  header.writeUInt8(last ? 0x01 : 0x00, 1);
  header.writeUInt16BE(8 + data.length, 2);
  header.writeUInt8(1, 6);
  return Buffer.concat([header, data]);
}

async function collect(message: IncomingMessage) {
  const chunks = [];
  for await (const chunk of message) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function rejection(promise: Promise<unknown>): Promise<any> {
  return promise.then(() => assert.fail('expected a rejection'), (err) => err);
}

describe('IncomingMessageReader', function() {
  it('reads a single-packet message', async function() {
    const source = new PassThrough();
    const reader = new IncomingMessageReader(source, new Debug());
    source.end(packet(0x11, Buffer.from('test1234'), true));

    const message = await reader.readMessage();
    assert.instanceOf(message, IncomingMessage);
    assert.strictEqual(message.type, 0x11);
    assert.strictEqual(message.resetConnection, false);
    assert.deepEqual(await collect(message), Buffer.from('test1234'));
  });

  it('joins the payloads of multi-packet messages', async function() {
    const source = new PassThrough();
    const reader = new IncomingMessageReader(source, new Debug());
    source.write(packet(0x04, Buffer.from('abc'), false));
    source.write(packet(0x04, Buffer.from('def'), false));
    source.end(packet(0x04, Buffer.from('ghi'), true));

    assert.deepEqual(await collect(await reader.readMessage()), Buffer.from('abcdefghi'));
  });

  it('handles headers and payloads split at every possible offset', async function() {
    const data = Buffer.concat([
      packet(0x04, Buffer.from('first-'), false),
      packet(0x04, Buffer.from('message'), true),
      packet(0x12, Buffer.from('second'), true)
    ]);

    for (let size = 1; size <= data.length; size++) {
      const source = new PassThrough();
      const reader = new IncomingMessageReader(source, new Debug());
      for (let i = 0; i < data.length; i += size) {
        source.write(data.subarray(i, i + size));
      }
      source.end();

      assert.deepEqual(await collect(await reader.readMessage()), Buffer.from('first-message'), `chunk size ${size}`);
      const second = await reader.readMessage();
      assert.strictEqual(second.type, 0x12);
      assert.deepEqual(await collect(second), Buffer.from('second'), `chunk size ${size}`);
      assert.match((await rejection(reader.readMessage())).message, /unexpected end of message stream/);
    }
  });

  it('iterates over messages until the source ends', async function() {
    const source = new PassThrough();
    const reader = new IncomingMessageReader(source, new Debug());
    source.write(packet(0x12, Buffer.from('one'), true));
    source.write(packet(0x04, Buffer.from('tw'), false));
    source.end(packet(0x04, Buffer.from('o'), true));

    const messages = [];
    for await (const message of reader) {
      messages.push([message.type, (await collect(message)).toString()]);
    }
    assert.deepEqual(messages, [[0x12, 'one'], [0x04, 'two']]);
  });

  it('does not copy payload data', async function() {
    const source = new PassThrough();
    const reader = new IncomingMessageReader(source, new Debug());
    const chunk = packet(0x04, Buffer.from('payload'), true);
    source.end(chunk);

    const chunks = [];
    for await (const data of await reader.readMessage()) {
      chunks.push(data);
    }
    assert.lengthOf(chunks, 1);
    assert.strictEqual(chunks[0].buffer, chunk.buffer);
  });

  it('waits for the previous message to be consumed before reading the next', async function() {
    const source = new PassThrough();
    const reader = new IncomingMessageReader(source, new Debug());
    source.write(packet(0x04, Buffer.from('one'), true));
    source.end(packet(0x04, Buffer.from('two'), true));

    const first = await reader.readMessage();
    let secondRead = false;
    const second = reader.readMessage().then((message) => {
      secondRead = true;
      return message;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.isFalse(secondRead);

    assert.deepEqual(await collect(first), Buffer.from('one'));
    assert.deepEqual(await collect(await second), Buffer.from('two'));
  });

  it('skips the rest of a message its consumer abandoned', async function() {
    const source = new PassThrough();
    const reader = new IncomingMessageReader(source, new Debug());
    source.write(packet(0x04, Buffer.from('abc'), false));
    source.write(packet(0x04, Buffer.from('def'), true));
    source.end(packet(0x04, Buffer.from('next'), true));

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of await reader.readMessage()) {
      break;
    }

    assert.deepEqual(await collect(await reader.readMessage()), Buffer.from('next'));
  });

  it('only reads from the source when data is wanted', async function() {
    const source = new PassThrough({ highWaterMark: 16 });
    const reader = new IncomingMessageReader(source, new Debug());

    const big = Buffer.alloc(1024, 0x41);
    const writes = [];
    for (let i = 0; i < 8; i++) {
      writes.push(source.write(packet(0x04, big, i === 7)));
    }

    // Nothing is consuming yet, so the source must apply backpressure.
    await new Promise((resolve) => setImmediate(resolve));
    assert.isFalse(writes[writes.length - 1]);
    assert.isAbove(source.readableLength, 0);

    const message = await reader.readMessage();
    assert.strictEqual((await collect(message)).length, 8 * 1024);
  });

  it('validates the packet length', async function() {
    const source = new PassThrough();
    const reader = new IncomingMessageReader(source, new Debug());
    const bad = packet(0x04, Buffer.alloc(0), true);
    bad.writeUInt16BE(0x0004, 2);
    source.end(bad);

    const error = await rejection(reader.readMessage());
    assert.instanceOf(error, ConnectionError);
    assert.strictEqual(error.message, 'Unable to process incoming packet');
  });

  it('fails a message whose source ends mid-packet', async function() {
    const source = new PassThrough();
    const reader = new IncomingMessageReader(source, new Debug());
    source.end(packet(0x04, Buffer.from('truncated'), true).subarray(0, 12));

    const message = await reader.readMessage();
    assert.instanceOf(await rejection(collect(message)), ConnectionError);
  });

  it('switches to a new source between messages', async function() {
    const first = new PassThrough();
    const reader = new IncomingMessageReader(first, new Debug());
    first.write(packet(0x12, Buffer.from('plain'), true));
    assert.deepEqual(await collect(await reader.readMessage()), Buffer.from('plain'));

    const second = new PassThrough();
    reader.source = second;
    second.end(packet(0x04, Buffer.from('secure'), true));
    assert.deepEqual(await collect(await reader.readMessage()), Buffer.from('secure'));

    // The old source is left alone.
    assert.strictEqual(first.listenerCount('data'), 0);
  });

  it('logs whole packets when data debugging is enabled', async function() {
    const debug = new Debug({ packet: true, data: true });
    const lines: string[] = [];
    debug.on('debug', (line) => lines.push(line));

    const source = new PassThrough();
    const reader = new IncomingMessageReader(source, debug);
    const data = packet(0x04, Buffer.from('logged'), true);
    source.write(data.subarray(0, 10));
    source.end(data.subarray(10));

    assert.deepEqual(await collect(await reader.readMessage()), Buffer.from('logged'));
    assert.include(lines.join('\n'), 'Received');
    assert.include(lines.join('\n'), 'logged');
  });
});
