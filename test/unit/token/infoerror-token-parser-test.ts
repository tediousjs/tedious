import StreamParser from '../../../src/token/stream-parser';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { assert } from 'chai';

describe('Infoerror token parser', () => {
  it('should have correct info', async () => {
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

    const parser = StreamParser.parseTokens([data], {} as any, { tdsVersion: '7_2' } as any);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    assert.strictEqual((token as any).number, number);
    assert.strictEqual((token as any).state, state);
    assert.strictEqual((token as any).class, class_);
    assert.strictEqual((token as any).message, message);
    assert.strictEqual((token as any).serverName, serverName);
    assert.strictEqual((token as any).procName, procName);
    assert.strictEqual((token as any).lineNumber, lineNumber);

    assert.isTrue((await parser.next()).done);
  });
});
