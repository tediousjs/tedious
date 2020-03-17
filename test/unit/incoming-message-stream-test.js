const BufferList = require('bl');
const { assert } = require('chai');

const IncomingMessageStream = require('../../src/incoming-message-stream');
const Message = require('../../src/message');
const Debug = require('../../src/debug');

describe('IncomingMessageStream', function() {
  it('extract messages from packet data', function(done) {
    const packetData = Buffer.from('test1234');
    const packetHeader = Buffer.alloc(8);

    let offset = 0;
    offset = packetHeader.writeUInt8(0x11, offset);
    offset = packetHeader.writeUInt8(0x01, offset);
    offset = packetHeader.writeUInt16BE(8 + packetData.length, offset);
    offset = packetHeader.writeUInt16BE(0x0000, offset);
    offset = packetHeader.writeUInt8(1, offset);
    packetHeader.writeUInt8(0x00, offset);

    const packet = Buffer.concat([packetHeader, packetData]);

    const incoming = new IncomingMessageStream(new Debug());

    incoming.on('data', function(message) {
      assert.instanceOf(message, Message);
      assert.strictEqual(message.type, 0x11);
      assert.strictEqual(message.resetConnection, false);

      const result = new BufferList(function(err, res) {
        if (err) {
          return done(err);
        }

        assert.deepEqual(res, packetData);

        done();
      });

      message.pipe(result);
    });

    incoming.end(packet);
  });

  it('streams packet data into the message as packets come in', function(done) {
    const packetData = Buffer.from('test1234');
    const packetHeader = Buffer.alloc(8);

    let offset = 0;
    offset = packetHeader.writeUInt8(0x11, offset);
    offset = packetHeader.writeUInt8(0x00, offset);
    offset = packetHeader.writeUInt16BE(8 + packetData.length, offset);
    offset = packetHeader.writeUInt16BE(0x0000, offset);
    offset = packetHeader.writeUInt8(1, offset);
    packetHeader.writeUInt8(0x00, offset);

    const firstPacket = Buffer.concat([packetHeader, packetData]);

    offset = 0;
    offset = packetHeader.writeUInt8(0x11, offset);
    offset = packetHeader.writeUInt8(0x01, offset);
    offset = packetHeader.writeUInt16BE(8 + packetData.length, offset);
    offset = packetHeader.writeUInt16BE(0x0000, offset);
    offset = packetHeader.writeUInt8(1, offset);
    packetHeader.writeUInt8(0x00, offset);

    const secondPacket = Buffer.concat([packetHeader, packetData]);

    const incoming = new IncomingMessageStream(new Debug());

    const result = new BufferList(function(err, res) {
      if (err) {
        return done(err);
      }

      assert.deepEqual(res, Buffer.concat([ packetData, packetData ]));

      done();
    });

    let messageEnded = false;
    incoming.on('data', function(message) {
      assert.instanceOf(message, Message);

      message.on('end', function() {
        messageEnded = true;
      });

      message.pipe(result);
    });

    incoming.write(firstPacket, function() {
      const writtenData = result.slice();

      assert.strictEqual(writtenData.length, 8);
      assert.deepEqual(writtenData, packetData);

      incoming.write(secondPacket, function() {
        const writtenData = result.slice();

        assert.strictEqual(writtenData.length, 16);
        assert.deepEqual(writtenData, Buffer.concat([ packetData, packetData ]));

        assert.strictEqual(messageEnded, true);
      });
    });
  });

  it('correctly handles the last package coming in after the stream was paused', function(done) {
    const packetData = Buffer.from('test1234');
    const packetHeader = Buffer.alloc(8);

    let offset = 0;
    offset = packetHeader.writeUInt8(0x11, offset);
    offset = packetHeader.writeUInt8(0x00, offset);
    offset = packetHeader.writeUInt16BE(8 + packetData.length, offset);
    offset = packetHeader.writeUInt16BE(0x0000, offset);
    offset = packetHeader.writeUInt8(1, offset);
    packetHeader.writeUInt8(0x00, offset);

    const firstPacket = Buffer.concat([packetHeader, packetData]);

    offset = 0;
    offset = packetHeader.writeUInt8(0x11, offset);
    offset = packetHeader.writeUInt8(0x01, offset);
    offset = packetHeader.writeUInt16BE(8 + packetData.length, offset);
    offset = packetHeader.writeUInt16BE(0x0000, offset);
    offset = packetHeader.writeUInt8(1, offset);
    packetHeader.writeUInt8(0x00, offset);

    const secondPacket = Buffer.concat([packetHeader, packetData]);

    const incoming = new IncomingMessageStream(new Debug());

    const result = new BufferList(function(err, res) {
      if (err) {
        return done(err);
      }

      assert.deepEqual(res, Buffer.concat([ packetData, packetData ]));

      done();
    });

    let messageEnded = false;
    incoming.on('data', function(message) {
      assert.instanceOf(message, Message);

      message.on('end', function() {
        messageEnded = true;
      });

      message.pipe(result);
    });

    incoming.write(firstPacket, function() {
      const writtenData = result.slice();

      assert.strictEqual(writtenData.length, 8);
      assert.deepEqual(writtenData, packetData);

      incoming.pause();

      incoming.write(secondPacket, function() {
        const writtenData = result.slice();

        assert.strictEqual(writtenData.length, 16);
        assert.deepEqual(writtenData, Buffer.concat([ packetData, packetData ]));

        assert.strictEqual(messageEnded, true);
      });

      assert.isFalse(messageEnded);
      incoming.resume();
    });
  });
});
