const BufferList = require('bl');

const IncomingMessageStream = require('../../../src/message/incoming-message-stream');
const Debug = require('../../../src/debug');
const { Packet, TYPE } = require('../../../src/packet');

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
  }
};
