var Parser = require('../../../src/token/stream-parser');
var WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');

function parse(status, curCmd, doneRowCount) {
  var doneRowCountLow = doneRowCount % 0x100000000;
  var doneRowCountHi = ~~(doneRowCount / 0x100000000);

  var buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(0xfd);
  buffer.writeUInt16LE(status);
  buffer.writeUInt16LE(curCmd);
  buffer.writeUInt32LE(doneRowCountLow);
  buffer.writeUInt32LE(doneRowCountHi);

  var parser = new Parser({ token() {} }, {}, { tdsVersion: '7_2' });
  parser.write(buffer.data);
  return parser.read();
}

module.exports.done = function(test) {
  var status = 0x0000;
  var curCmd = 1;
  var doneRowCount = 2;

  var token = parse(status, curCmd, doneRowCount);

  test.ok(!token.more);
  test.strictEqual(token.curCmd, curCmd);
  test.ok(!token.rowCount);

  test.done();
};

module.exports.more = function(test) {
  var status = 0x0001;
  var curCmd = 1;
  var doneRowCount = 2;

  var token = parse(status, curCmd, doneRowCount);

  test.ok(token.more);
  test.strictEqual(token.curCmd, curCmd);
  test.ok(!token.rowCount);

  test.done();
};

module.exports.doneRowCount = function(test) {
  var status = 0x0010;
  var curCmd = 1;
  var doneRowCount = 0x1200000034;

  var token = parse(status, curCmd, doneRowCount);

  test.ok(!token.more);
  test.strictEqual(token.curCmd, 1);
  test.strictEqual(token.rowCount, doneRowCount);

  test.done();
};
