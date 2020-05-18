import { assert } from 'chai';

import Parser from '../../../src/token/stream-parser';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import Debug from '../../../src/debug';
import { InternalConnectionOptions } from '../../../src/connection-options';

describe('Feature Ext Praser', () => {
  it('should be fed authentication', () => {
    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xAE); // FEATUREEXTACK token header

    buffer.writeUInt8(0x01);
    buffer.writeUInt32LE(1);
    buffer.writeBuffer(Buffer.from('a'));

    buffer.writeUInt8(0x02);
    buffer.writeUInt32LE(2);
    buffer.writeBuffer(Buffer.from('bc'));

    buffer.writeUInt8(0x03);
    buffer.writeUInt32LE(0);
    buffer.writeBuffer(Buffer.from(''));

    buffer.writeUInt8(0xFF); // terminator

    const parser = new Parser(new Debug(), new InternalConnectionOptions());
    parser.write(buffer.data);

    const token = parser.read();

    assert.isOk(token.fedAuth.equals(Buffer.from('bc')));
  });
});
