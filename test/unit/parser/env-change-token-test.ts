import { assert } from 'chai';
import { EnvChangeTokenParser } from '../../../src/parser/tokens/env-change-token';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';

describe('EnvChangeTokenParser', function() {
  it('can parse packet size change tokens', function() {
    const oldSize = '1024';
    const newSize = '2048';

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xe3);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(0x04); // Packet size
    buffer.writeBVarchar(newSize);
    buffer.writeBVarchar(oldSize);

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);

    const parser = new EnvChangeTokenParser();
    const result = parser.parse(data, 1);

    console.log(result);

    assert.isTrue(result.done);
    assert.isDefined(result.value);

    const token = result.value!;

    assert.strictEqual(token.type, 'PACKET_SIZE');
    assert.strictEqual(token.oldValue, 1024);
    assert.strictEqual(token.newValue, 2048);
  });
});
