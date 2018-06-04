var Parser = require('../../../src/token/stream-parser');
var WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');

module.exports.info = function(test) {
  var number = 3;
  var state = 4;
  var class_ = 5;
  var message = 'message';
  var serverName = 'server';
  var procName = 'proc';
  var lineNumber = 6;

  var buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(0xab);
  buffer.writeUInt16LE(0); // Length written later
  buffer.writeUInt32LE(number);
  buffer.writeUInt8(state);
  buffer.writeUInt8(class_);
  buffer.writeUsVarchar(message);
  buffer.writeBVarchar(serverName);
  buffer.writeBVarchar(procName);
  buffer.writeUInt32LE(lineNumber);

  var data = buffer.data;
  data.writeUInt16LE(data.length - 3, 1);

  var parser = new Parser({ token() {} }, {}, { tdsVersion: '7_2' });
  parser.write(data);
  var token = parser.read();

  test.strictEqual(token.number, number);
  test.strictEqual(token.state, state);
  test.strictEqual(token.class, class_);
  test.strictEqual(token.message, message);
  test.strictEqual(token.serverName, serverName);
  test.strictEqual(token.procName, procName);
  test.strictEqual(token.lineNumber, lineNumber);

  test.done();
};
