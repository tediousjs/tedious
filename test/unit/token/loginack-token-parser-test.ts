import StreamParser, { type ParserOptions } from '../../../src/token/stream-parser';
import { LoginAckToken } from '../../../src/token/token';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import Debug from '../../../src/debug';
import { assert } from 'chai';

const options = { tdsVersion: '7_2', useUTC: false } as ParserOptions;

describe('Loginack Token Parser', () => {
  it('should have correct info', async () => {
    const debug = new Debug();
    const interfaceType = 1;
    const version = 0x72090002;
    const progName = 'prog';
    const progVersion = {
      major: 1,
      minor: 2,
      buildNumHi: 3,
      buildNumLow: 4
    };

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xad);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(interfaceType);
    buffer.writeUInt32BE(version);
    buffer.writeBVarchar(progName);
    buffer.writeUInt8(progVersion.major);
    buffer.writeUInt8(progVersion.minor);
    buffer.writeUInt8(progVersion.buildNumHi);
    buffer.writeUInt8(progVersion.buildNumLow);

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);
    // console.log(buffer)

    const parser = StreamParser.parseTokens([data], debug, options);

    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, LoginAckToken);
    assert.strictEqual(token.interface, 'SQL_TSQL');
    assert.strictEqual(token.tdsVersion, '7_2');
    assert.strictEqual(token.progName, progName);
    assert.deepEqual(token.progVersion, progVersion);

    assert.isTrue((await parser.next()).done);
  });
});
