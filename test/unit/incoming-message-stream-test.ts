import { assert } from 'chai';
import IncomingMessageStream, { IncomingMessage } from '../../src/incoming-message-stream';
import Debug from '../../src/debug';
import { ConnectionError } from '../../src/errors';

function buildPacket(data: Buffer, { type = 0x11, last = false } = {}) {
  const header = Buffer.alloc(8);

  let offset = 0;
  offset = header.writeUInt8(type, offset);
  offset = header.writeUInt8(last ? 0x01 : 0x00, offset);
  offset = header.writeUInt16BE(8 + data.length, offset);
  offset = header.writeUInt16BE(0x0000, offset);
  offset = header.writeUInt8(1, offset);
  header.writeUInt8(0x00, offset);

  return Buffer.concat([header, data]);
}

async function readAll(message: IncomingMessage): Promise<Buffer> {
  const chunks = [];
  for await (const chunk of message) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

describe('IncomingMessageStream', function() {
  it('extracts a message and its payload from packet data', async function() {
    const packetData = Buffer.from('test1234');

    const incoming = new IncomingMessageStream(new Debug());
    incoming.end(buildPacket(packetData, { last: true }));

    const messages: IncomingMessage[] = [];
    for await (const message of incoming) {
      assert.instanceOf(message, IncomingMessage);
      assert.strictEqual(message.type, 0x11);

      assert.deepEqual(await readAll(message), packetData);

      messages.push(message);
    }

    assert.lengthOf(messages, 1);
  });

  it('streams packet data into the message as packets come in', async function() {
    const packetData = Buffer.from('test1234');

    const incoming = new IncomingMessageStream(new Debug());

    incoming.write(buildPacket(packetData));

    const message = await new Promise<IncomingMessage>((resolve) => {
      incoming.once('data', resolve);
    });
    const iterator = message[Symbol.asyncIterator]();

    // The first packet's data is available before the last packet arrived.
    assert.deepEqual((await iterator.next()).value, packetData);

    incoming.end(buildPacket(packetData, { last: true }));

    assert.deepEqual((await iterator.next()).value, packetData);
    assert.isTrue((await iterator.next()).done);
  });

  it('handles packets split across multiple writes, including inside the header', async function() {
    const packetData = Buffer.from('test1234');
    const packet = buildPacket(packetData, { last: true });

    const incoming = new IncomingMessageStream(new Debug());

    for (let i = 0; i < packet.length; i += 3) {
      incoming.write(packet.slice(i, i + 3));
    }
    incoming.end();

    for await (const message of incoming) {
      assert.deepEqual(await readAll(message), packetData);
    }
  });

  it('handles multiple messages, waiting for one to be consumed before continuing with the next', async function() {
    const firstData = Buffer.from('first123');
    const secondData = Buffer.from('second12');

    const incoming = new IncomingMessageStream(new Debug());

    // Both messages arrive in a single chunk.
    incoming.end(Buffer.concat([
      buildPacket(firstData, { last: true }),
      buildPacket(secondData, { type: 0x12, last: true })
    ]));

    const received = [];
    for await (const message of incoming) {
      received.push({ type: message.type, data: await readAll(message) });
    }

    assert.deepEqual(received, [
      { type: 0x11, data: firstData },
      { type: 0x12, data: secondData }
    ]);
  });

  it('should validate packet header size', function(done) {
    const packetData = Buffer.from('test1234');
    const packet = buildPacket(packetData, { last: true });
    packet.writeUInt16BE(5, 2); // invalid packet length

    const incoming = new IncomingMessageStream(new Debug());

    incoming.on('error', (err) => {
      assert.instanceOf(err, ConnectionError);
      assert.equal(err.message, 'Unable to process incoming packet');
      done();
    });

    incoming.on('data', () => {});
    incoming.end(packet);
  });
});
