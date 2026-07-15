import Debug from '../../../src/debug';
import { Parser } from '../../../src/token/token-stream-parser';
import { TYPE, DatabaseEnvChangeToken } from '../../../src/token/token';
import { type ParserOptions } from '../../../src/token/stream-parser';
import { TokenHandler } from '../../../src/token/handler';
import type Message from '../../../src/message';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { assert } from 'chai';

const options = { tdsVersion: '7_2', useUTC: false } as ParserOptions;

function createDbChangeBuffer() {
  const oldDb = 'old';
  const newDb = 'new';
  const buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(TYPE.ENVCHANGE);
  buffer.writeUInt16LE(0); // Length written later
  buffer.writeUInt8(0x01); // Database
  buffer.writeUInt8(newDb.length);
  buffer.writeString(newDb);
  buffer.writeUInt8(oldDb.length);
  buffer.writeString(oldDb);

  buffer.data.writeUInt16LE(buffer.data.length - (1 + 2), 1);
  // console.log(buffer)

  return buffer.data;
}

// Test handler that only handles database change events
class TestDatabaseChangeHandler extends TokenHandler {
  onDatabaseChange(token: DatabaseEnvChangeToken) {
    assert.isDefined(token);
  }
}

describe('Token Stream Parser', () => {
  it('should parse envChange token', function(done) {
    const debug = new Debug({ token: true });
    const buffer = createDbChangeBuffer();

    // Cast to Message since tests use a simplified input instead of full Message
    const parser = new Parser([buffer] as unknown as Message, debug, new TestDatabaseChangeHandler(), options);

    parser.on('end', done);
  });

  it('should parse token split across buffers', function(done) {
    const debug = new Debug({ token: true });
    const buffer = createDbChangeBuffer();

    // Cast to Message since tests use a simplified input instead of full Message
    const parser = new Parser([buffer.slice(0, 6), buffer.slice(6)] as unknown as Message, debug, new TestDatabaseChangeHandler(), options);

    parser.on('end', done);
  });
});
