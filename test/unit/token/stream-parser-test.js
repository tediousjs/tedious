// @ts-check

import Debug from '../../../src/debug';
import Parser from '../../../src/token/stream-parser';
import { TYPE } from '../../../src/token/token';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { assert } from 'chai';

const debug = new Debug({ token: true });

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

describe('Token Stream Parser', () => {
  it('should envChange', async function() {
    const buffer = createDbChangeBuffer();
    const options = {
      useUTC: false,
      lowerCaseGuids: true,
      tdsVersion: '7_4',
      useColumnNames: false,
      columnNameReplacer: undefined,
      camelCaseColumns: false
    };

    const tokens = [];
    for await (const token of Parser.parseTokens([buffer], debug, options)) {
      tokens.push(token);
    }

    assert.lengthOf(tokens, 1);
  });

  it('should split token across buffers', async function() {
    const buffer = createDbChangeBuffer();
    const options = {
      useUTC: false,
      lowerCaseGuids: true,
      tdsVersion: '7_4',
      useColumnNames: false,
      columnNameReplacer: undefined,
      camelCaseColumns: false
    };

    const tokens = [];
    for await (const token of Parser.parseTokens([buffer.slice(0, 6), buffer.slice(6)], debug, options)) {
      tokens.push(token);
    }

    assert.lengthOf(tokens, 1);
  });
});
