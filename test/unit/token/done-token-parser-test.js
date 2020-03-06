const Parser = require('../../../src/token/stream-parser');
const WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;

function parse(status, curCmd, doneRowCount) {
  var doneRowCountLow = doneRowCount % 0x100000000;
  var doneRowCountHi = ~~(doneRowCount / 0x100000000);

  var buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(0xfd);
  buffer.writeUInt16LE(status);
  buffer.writeUInt16LE(curCmd);
  buffer.writeUInt32LE(doneRowCountLow);
  buffer.writeUInt32LE(doneRowCountHi);

  var parser = new Parser({ token() { } }, {}, { tdsVersion: '7_2' });
  parser.write(buffer.data);
  return parser.read();
}

describe('Done Token Parser', () => {
  it('should done', () => {
    const status = 0x0000;
    const curCmd = 1;
    const doneRowCount = 2;

    const token = parse(status, curCmd, doneRowCount);

    assert.isOk(!token.more);
    assert.strictEqual(token.curCmd, curCmd);
    assert.isOk(!token.rowCount);
  });

  it('should more', () => {
    const status = 0x0001;
    const curCmd = 1;
    const doneRowCount = 2;

    const token = parse(status, curCmd, doneRowCount);

    assert.isOk(token.more);
    assert.strictEqual(token.curCmd, curCmd);
    assert.isOk(!token.rowCount);
  });

  it('should done row count', () => {
    const status = 0x0010;
    const curCmd = 1;
    const doneRowCount = 0x1200000034;

    const token = parse(status, curCmd, doneRowCount);

    assert.isOk(!token.more);
    assert.strictEqual(token.curCmd, 1);
    assert.strictEqual(token.rowCount, doneRowCount);
  });
});
