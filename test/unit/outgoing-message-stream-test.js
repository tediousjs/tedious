const BufferList = require('bl');
const { assert } = require('chai');

const OutgoingMessageStream = require('../../src/outgoing-message-stream');
const Message = require('../../src/message');
const Debug = require('../../src/debug');

describe('OutgoingMessageStream', function() {
  it('wraps the given message contents into a packet', function(done) {
    const contents = Buffer.from('test1234');

    const message = new Message({ type: 0x11 });
    message.end(contents);

    const outgoing = new OutgoingMessageStream(new Debug(), { packetSize: 1024 * 4 });
    const result = new BufferList(function(err, buf) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(buf.length, 16);

      assert.strictEqual(buf.readUInt8(0), 0x11);
      assert.strictEqual(buf.readUInt8(1), 0x01);
      assert.strictEqual(buf.readUInt16BE(2), 8 + contents.length);
      assert.strictEqual(buf.readUInt16BE(4), 0x0000);
      assert.strictEqual(buf.readUInt8(6), 1);
      assert.strictEqual(buf.readUInt8(7), 0);

      assert.deepEqual(buf.slice(8), contents);

      done();
    });

    outgoing.write(message);

    outgoing.pipe(result);
    outgoing.end();
  });

  it('splits messages that exceed the packetSize - packetHeaderSize into multiple packets', function(done) {
    const contents = Buffer.from('test1234');

    const message = new Message({ type: 0x11 });
    message.end(contents);

    const outgoing = new OutgoingMessageStream(new Debug(), { packetSize: 8 + 4 });

    const result = new BufferList(function(err, buf) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(buf.length, 24);

      assert.strictEqual(buf.readUInt8(0), 0x11);
      assert.strictEqual(buf.readUInt8(1), 0x00);
      assert.strictEqual(buf.readUInt16BE(2), 8 + 4);
      assert.strictEqual(buf.readUInt16BE(4), 0x0000);
      assert.strictEqual(buf.readUInt8(6), 1);
      assert.strictEqual(buf.readUInt8(7), 0);
      assert.deepEqual(buf.slice(8, 12), contents.slice(0, 4));

      assert.strictEqual(buf.readUInt8(12), 0x11);
      assert.strictEqual(buf.readUInt8(13), 0x01);
      assert.strictEqual(buf.readUInt16BE(14), 8 + 4);
      assert.strictEqual(buf.readUInt16BE(16), 0x0000);
      assert.strictEqual(buf.readUInt8(18), 2);
      assert.strictEqual(buf.readUInt8(19), 0);
      assert.deepEqual(buf.slice(20, 24), contents.slice(4, 8));

      done();
    });

    outgoing.pipe(result);
    outgoing.end(message);
  });

  it('supports writing multiple different messages', function(done) {
    const contents = Buffer.from('test1234');

    const messages = [
      new Message({ type: 0x11 }),
      new Message({ type: 0x12 })
    ];

    const outgoing = new OutgoingMessageStream(new Debug(), { packetSize: 1024 * 4 });
    const result = new BufferList(function(err, buf) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(buf.length, 32);
      assert.strictEqual(buf.readUInt8(0), 0x11);
      assert.strictEqual(buf.readUInt8(1), 0x01);
      assert.strictEqual(buf.readUInt16BE(2), 8 + contents.length);
      assert.strictEqual(buf.readUInt16BE(4), 0x0000);
      assert.strictEqual(buf.readUInt8(6), 1);
      assert.strictEqual(buf.readUInt8(7), 0);
      assert.deepEqual(buf.slice(8, 16), contents);

      assert.strictEqual(buf.readUInt8(16), 0x12);
      assert.strictEqual(buf.readUInt8(17), 0x01);
      assert.strictEqual(buf.readUInt16BE(18), 8 + contents.length);
      assert.strictEqual(buf.readUInt16BE(20), 0x0000);
      assert.strictEqual(buf.readUInt8(22), 1);
      assert.strictEqual(buf.readUInt8(23), 0);
      assert.deepEqual(buf.slice(24, 32), contents);

      done();
    });

    outgoing.pipe(result);
    messages.forEach(function(message) {
      message.end(contents);
      outgoing.write(message);
    });
    outgoing.end();
  });
});
