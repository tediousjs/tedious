import StreamParser, { type ParserOptions } from '../../../src/token/stream-parser';
import { SSPIToken } from '../../../src/token/token';
import WriteBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { assert } from 'chai';

const options = { tdsVersion: '7_2', useUTC: false } as ParserOptions;

describe('sspi token parser', function() {
  it('should parse the security token', async function() {
    const securityToken = Buffer.from([0x60, 0x82, 0x01, 0x02, 0xa1, 0xb2, 0xc3, 0xd4]);

    const source = new WriteBuffer();
    source.writeUInt8(0xed);
    source.writeUsVarbyte(securityToken);

    const parser = StreamParser.parseTokens([source.data], options);

    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, SSPIToken);
    assert.deepEqual(token.data, securityToken);

    assert.isTrue((await parser.next()).done);
  });
});
