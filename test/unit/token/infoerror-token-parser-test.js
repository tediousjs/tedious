const Parser = require('../../../src/token/stream-parser');
const WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;

describe('Infoerror token parser', () => {
  it('should have correct info', () => {
    const number = 3;
    const state = 4;
    const class_ = 5;
    const message = 'message';
    const serverName = 'server';
    const procName = 'proc';
    const lineNumber = 6;

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xab);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt32LE(number);
    buffer.writeUInt8(state);
    buffer.writeUInt8(class_);
    buffer.writeUsVarchar(message);
    buffer.writeBVarchar(serverName);
    buffer.writeBVarchar(procName);
    buffer.writeUInt32LE(lineNumber);

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);

    const parser = new Parser({ token() { } }, {}, { tdsVersion: '7_2' });
    parser.write(data);
    const token = parser.read();

    assert.strictEqual(token.number, number);
    assert.strictEqual(token.state, state);
    assert.strictEqual(token.class, class_);
    assert.strictEqual(token.message, message);
    assert.strictEqual(token.serverName, serverName);
    assert.strictEqual(token.procName, procName);
    assert.strictEqual(token.lineNumber, lineNumber);
  });
});
