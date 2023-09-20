var Debug = require('../../../src/debug');
var Parser = require('../../../src/token/stream-parser');
var TYPE = require('../../../src/token/token').TYPE;
var WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;

var debug = new Debug({ token: true });

function createDbChangeBuffer() {
  var oldDb = 'old';
  var newDb = 'new';
  var buffer = new WritableTrackingBuffer(50, 'ucs2');

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

describe('Token Stream Parser', function() {
  it('should envChange', async function() {
    const buffer = createDbChangeBuffer();

    const parser = Parser.parseTokens([buffer], debug, {}, []);

    const tokens = [];
    for await (const token of parser) {
      tokens.push(token);
    }

    assert.lengthOf(tokens, 1);
    assert.strictEqual(tokens[0].name, 'ENVCHANGE');
  });

  it('should split token across buffers', async function() {
    const buffer = createDbChangeBuffer();

    const parser = Parser.parseTokens([buffer.slice(0, 6), buffer.slice(6)], debug, {}, []);

    const tokens = [];
    for await (const token of parser) {
      tokens.push(token);
    }

    assert.lengthOf(tokens, 1);
    assert.strictEqual(tokens[0].name, 'ENVCHANGE');
  });
});
