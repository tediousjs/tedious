import { assert } from 'chai';

import Parser, { type ParserOptions } from '../../../src/token/stream-parser';
import { ReturnValueToken } from '../../../src/token/token';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';

const options = {
  useUTC: false,
  tdsVersion: '7_2'
} as ParserOptions;

describe('ReturnValue Token Parser', function() {
  it('should parse json values', async function() {
    const value = '{"a":"ü"}';
    const payload = Buffer.from(value, 'utf8');

    const buffer = new WritableTrackingBuffer();
    buffer.writeUInt8(0xAC); // RETURNVALUE token
    buffer.writeUInt16LE(1); // paramOrdinal
    buffer.writeBVarchar('@out', 'ucs2'); // paramName
    buffer.writeUInt8(0x01); // status
    buffer.writeUInt32LE(0); // userType
    buffer.writeUInt16LE(0); // flags
    buffer.writeUInt8(0xF4); // json TYPE_INFO
    buffer.writeUInt64LE(payload.length); // PLP total length
    buffer.writeUInt32LE(payload.length); // chunk length
    buffer.writeBuffer(payload);
    buffer.writeUInt32LE(0); // PLP terminator

    const parser = Parser.parseTokens([buffer.data], options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, ReturnValueToken);
    assert.strictEqual(token.paramOrdinal, 1);
    assert.strictEqual(token.paramName, 'out');
    assert.strictEqual(token.metadata.type.name, 'JSON');
    assert.strictEqual(token.value, value);
    assert.isTrue((await parser.next()).done);
  });

  it('should parse null json values', async function() {

    const buffer = new WritableTrackingBuffer();
    buffer.writeUInt8(0xAC); // RETURNVALUE token
    buffer.writeUInt16LE(1); // paramOrdinal
    buffer.writeBVarchar('@out', 'ucs2'); // paramName
    buffer.writeUInt8(0x01); // status
    buffer.writeUInt32LE(0); // userType
    buffer.writeUInt16LE(0); // flags
    buffer.writeUInt8(0xF4); // json TYPE_INFO
    buffer.writeBuffer(Buffer.alloc(8, 0xFF)); // PLP null

    const parser = Parser.parseTokens([buffer.data], options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, ReturnValueToken);
    assert.strictEqual(token.paramOrdinal, 1);
    assert.strictEqual(token.paramName, 'out');
    assert.strictEqual(token.metadata.type.name, 'JSON');
    assert.isNull(token.value);
    assert.isTrue((await parser.next()).done);
  });

  it('should parse json values that arrive byte by byte', async function() {
    const value = '{"a":"\u{1F600}"}';
    const payload = Buffer.from(value, 'utf8');
    const split = 7;

    const buffer = new WritableTrackingBuffer();
    buffer.writeUInt8(0xAC); // RETURNVALUE token
    buffer.writeUInt16LE(1); // paramOrdinal
    buffer.writeBVarchar('@out', 'ucs2'); // paramName
    buffer.writeUInt8(0x01); // status
    buffer.writeUInt32LE(0); // userType
    buffer.writeUInt16LE(0); // flags
    buffer.writeUInt8(0xF4); // json TYPE_INFO
    buffer.writeUInt64LE(payload.length); // PLP total length
    buffer.writeUInt32LE(split); // first chunk, ending inside the emoji
    buffer.writeBuffer(payload.subarray(0, split));
    buffer.writeUInt32LE(payload.length - split);
    buffer.writeBuffer(payload.subarray(split));
    buffer.writeUInt32LE(0); // PLP terminator

    const chunks = Array.from(buffer.data, (byte) => Buffer.from([byte]));

    const parser = Parser.parseTokens(chunks, options);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.instanceOf(token, ReturnValueToken);
    assert.strictEqual(token.value, value);
    assert.isTrue((await parser.next()).done);
  });
});
