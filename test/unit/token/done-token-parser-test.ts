import StreamParser from '../../../src/token/stream-parser';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { assert } from 'chai';

function parse(status: number, curCmd: number, doneRowCount: number) {
  const doneRowCountLow = doneRowCount % 0x100000000;
  const doneRowCountHi = ~~(doneRowCount / 0x100000000);

  const buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(0xfd);
  buffer.writeUInt16LE(status);
  buffer.writeUInt16LE(curCmd);
  buffer.writeUInt32LE(doneRowCountLow);
  buffer.writeUInt32LE(doneRowCountHi);

  const parser = StreamParser.parseTokens([buffer.data], {} as any, { tdsVersion: '7_2' } as any);
  return parser;
}

describe('Done Token Parser', () => {
  it('should done', async () => {
    const status = 0x0000;
    const curCmd = 1;
    const doneRowCount = 2;

    const parser = parse(status, curCmd, doneRowCount);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.isOk(!(token as any).more);
    assert.strictEqual((token as any).curCmd, curCmd);
    assert.isOk(!(token as any).rowCount);
  });

  it('should more', async () => {
    const status = 0x0001;
    const curCmd = 1;
    const doneRowCount = 2;

    const parser = parse(status, curCmd, doneRowCount);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.isOk((token as any).more);
    assert.strictEqual((token as any).curCmd, curCmd);
    assert.isOk(!(token as any).rowCount);
  });

  it('should done row count', async () => {
    const status = 0x0010;
    const curCmd = 1;
    const doneRowCount = 0x1200000034;

    const parser = parse(status, curCmd, doneRowCount);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.isOk(!(token as any).more);
    assert.strictEqual((token as any).curCmd, 1);
    assert.strictEqual((token as any).rowCount, doneRowCount);
  });
});
