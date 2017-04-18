const BufferList = require('bl');

const IncomingMessageStream = require('../../../src/message/incoming-message-stream');
const Debug = require('../../../src/debug');
const { Packet, TYPE, HEADER_LENGTH } = require('../../../src/packet');

module.exports.IncomingMessageStream = {
  'transforms data written into it into individual message streams': function(test) {
    test.expect(2);

    const payload = new Buffer([1, 2, 3]);
    const debug = new Debug();
    const incomingMessageStream = new IncomingMessageStream(debug);

    incomingMessageStream.on('data', (message) => {
      test.strictEqual(message.type, TYPE.TABULAR_RESULT);

      message.pipe(new BufferList(function(err, data) {
        test.ifError(err);

        data.equals(payload);

        test.done();
      }));
    });

    const packet = new Packet(TYPE.TABULAR_RESULT);
    packet.last(true);
    packet.addData(payload);

    incomingMessageStream.write(packet.buffer);
  },

  'correctly supports data spread over multiple packets': function(test) {
    test.expect(2);

    const payload = new Buffer([1, 2, 3, 4, 5, 6]);
    const debug = new Debug();
    const incomingMessageStream = new IncomingMessageStream(debug);

    incomingMessageStream.on('data', (message) => {
      test.strictEqual(message.type, TYPE.TABULAR_RESULT);

      message.pipe(new BufferList(function(err, data) {
        test.ifError(err);

        data.equals(payload);

        test.done();
      }));
    });

    let packet;

    packet = new Packet(TYPE.TABULAR_RESULT);
    packet.addData(payload.slice(0, 3));
    incomingMessageStream.write(packet.buffer);

    packet = new Packet(TYPE.TABULAR_RESULT);
    packet.last(true);
    packet.addData(payload.slice(3));
    incomingMessageStream.write(packet.buffer);
  },

  'correctly signals pressure building up': function(test) {
    test.expect(33);

    const debug = new Debug();
    const incomingMessageStream = new IncomingMessageStream(debug);

    // Don't actually consume any of the `IncomingMessage` data.
    incomingMessageStream.on('data', (message) => {
      test.strictEqual(message.type, TYPE.TABULAR_RESULT);
    });

    const packet = new Packet(TYPE.TABULAR_RESULT);
    packet.addData(new Buffer((8 * 1024) - HEADER_LENGTH).fill('x'));

    // The first packet we push in will cause a new `IncomingMessage` to be
    // created and the packet's data will be pushed through.
    test.ok(incomingMessageStream.write(packet.buffer));
    test.strictEqual(0, incomingMessageStream._writableState.length);
    test.strictEqual(0, incomingMessageStream.currentMessage._writableState.length);
    test.strictEqual(8184, incomingMessageStream.currentMessage._readableState.length);

    // The first packet's data will also make it to the current message.
    test.ok(incomingMessageStream.write(packet.buffer));
    test.strictEqual(0, incomingMessageStream._writableState.length);
    test.strictEqual(0, incomingMessageStream.currentMessage._writableState.length);
    test.strictEqual(16368, incomingMessageStream.currentMessage._readableState.length);

    // The third packet's data will make us hit the `highWaterMark` in the
    // readable side of the current message.
    test.ok(incomingMessageStream.write(packet.buffer));
    test.strictEqual(0, incomingMessageStream._writableState.length);
    test.strictEqual(0, incomingMessageStream.currentMessage._writableState.length);
    test.strictEqual(24552, incomingMessageStream.currentMessage._readableState.length);

    // Now that we hit the `highWaterMark`, no more data will be transformed by
    // the `IncomingMessage`, and data starts to buffer up on its writable side.
    test.ok(incomingMessageStream.write(packet.buffer));
    test.strictEqual(0, incomingMessageStream._writableState.length);
    test.strictEqual(8184, incomingMessageStream.currentMessage._writableState.length);
    test.strictEqual(24552, incomingMessageStream.currentMessage._readableState.length);

    // More data buffering up on the writable side.
    test.ok(incomingMessageStream.write(packet.buffer));
    test.strictEqual(0, incomingMessageStream._writableState.length);
    test.strictEqual(16368, incomingMessageStream.currentMessage._writableState.length);
    test.strictEqual(24552, incomingMessageStream.currentMessage._readableState.length);

    // This next packet will cause us to hit the `highWaterMark` on the writable side
    // of the `IncomingMessage`, and `IncomingMessage#write` will start returning false.
    // `IncomingMessageStream#_transform` will wait for the `drain` event on `IncomingMessage`,
    // so data now also starts to buffer up on the writable side of `IncomingMessageStream`.
    test.ok(incomingMessageStream.write(packet.buffer));
    test.strictEqual(8192, incomingMessageStream._writableState.length);
    test.strictEqual(24552, incomingMessageStream.currentMessage._writableState.length);
    test.strictEqual(24552, incomingMessageStream.currentMessage._readableState.length);

    // More data buffering up in `IncomingMessageStream`. `IncomingMessageStream#write`
    // starts returning false to signal pressure building up.
    test.ok(!incomingMessageStream.write(packet.buffer));
    test.strictEqual(16384, incomingMessageStream._writableState.length);
    test.strictEqual(24552, incomingMessageStream.currentMessage._writableState.length);
    test.strictEqual(24552, incomingMessageStream.currentMessage._readableState.length);

    test.ok(!incomingMessageStream.write(packet.buffer));
    test.strictEqual(24576, incomingMessageStream._writableState.length);
    test.strictEqual(24552, incomingMessageStream.currentMessage._writableState.length);
    test.strictEqual(24552, incomingMessageStream.currentMessage._readableState.length);

    test.done();
  }
};
