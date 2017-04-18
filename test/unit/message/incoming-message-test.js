const BufferList = require('bl');

const IncomingMessage = require('../../../src/message/incoming-message');
const { TYPE } = require('../../../src/packet');

module.exports.IncomingMessage = {
  'has a message type': function(test) {
    const message = new IncomingMessage(TYPE.TABULAR_RESULT);

    test.strictEqual(message.type, TYPE.TABULAR_RESULT);

    test.done();
  },

  'is a simple pass-through stream': function(test) {
    const message = new IncomingMessage(TYPE.TABULAR_RESULT);

    message.pipe(new BufferList((err, data) => {
      test.ifError(err);

      test.deepEqual(data, new Buffer([1, 2, 3, 4, 5, 6]));

      test.done();
    }));

    message.write(new Buffer([1, 2, 3]));
    message.write(new Buffer([4, 5, 6]));
    message.end();
  }
};
