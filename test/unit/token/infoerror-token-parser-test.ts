import StreamParser, { type ParserOptions } from '../../../src/token/stream-parser';
import { InfoMessageToken } from '../../../src/token/token';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import Debug from '../../../src/debug';
import { assert } from 'chai';

const options = { tdsVersion: '7_2', useUTC: false } as ParserOptions;

describe('Infoerror token parser', function() {
  it('should have correct info', async function() {
    const debug = new Debug();
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

    const parser = StreamParser.parseTokens([data], debug, options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, InfoMessageToken);
    assert.strictEqual(token.number, number);
    assert.strictEqual(token.state, state);
    assert.strictEqual(token.class, class_);
    assert.strictEqual(token.message, message);
    assert.strictEqual(token.serverName, serverName);
    assert.strictEqual(token.procName, procName);
    assert.strictEqual(token.lineNumber, lineNumber);

    assert.isTrue((await parser.next()).done);
  });
});
