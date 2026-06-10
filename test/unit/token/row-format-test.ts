import { assert } from 'chai';

import Debug from '../../../src/debug';
import { Parser } from '../../../src/token/token-stream-parser';
import { type ParserOptions } from '../../../src/token/stream-parser';
import { TokenHandler } from '../../../src/token/handler';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';

const COLLATION = Buffer.from('0904d00034', 'hex');

function buildTokenStream() {
  const buf = new WritableTrackingBuffer(1024, null, true);

  // COLMETADATA: [id] int, [name] nvarchar(30), [name] nvarchar(30) (duplicate)
  buf.writeUInt8(0x81);
  buf.writeUInt16LE(3);

  buf.writeUInt32LE(0);
  buf.writeUInt16LE(8);
  buf.writeUInt8(0x38); // INT4
  buf.writeBVarchar('id', 'ucs2');

  for (let i = 0; i < 2; i++) {
    buf.writeUInt32LE(0);
    buf.writeUInt16LE(8);
    buf.writeUInt8(0xE7); // NVARCHAR
    buf.writeUInt16LE(60);
    buf.writeBuffer(COLLATION);
    buf.writeBVarchar('name', 'ucs2');
  }

  // ROW: 1, 'first', 'second'
  buf.writeUInt8(0xD1);
  buf.writeInt32LE(1);
  for (const value of ['first', 'second']) {
    buf.writeUInt16LE(value.length * 2);
    buf.writeString(value, 'ucs2');
  }

  // NBCROW: 2, null, 'third'
  buf.writeUInt8(0xD2);
  buf.writeUInt8(0b010); // second column is null
  buf.writeInt32LE(2);
  buf.writeUInt16LE('third'.length * 2);
  buf.writeString('third', 'ucs2');

  // DONE
  buf.writeUInt8(0xFD);
  buf.writeUInt16LE(0);
  buf.writeUInt16LE(0);
  buf.writeBigUInt64LE(0n);

  return buf.data;
}

class CollectingHandler extends TokenHandler {
  rows: unknown[] = [];

  onColMetadata() {}
  onRow(row: unknown) {
    this.rows.push(row);
  }
  onDone() {}
}

async function parseRows(options: Partial<ParserOptions>): Promise<any[]> {
  const handler = new CollectingHandler();

  const parser = new Parser(
    [buildTokenStream()] as any,
    new Debug(),
    handler,
    { tdsVersion: '7_4', useUTC: true, useColumnNames: false, ...options } as ParserOptions
  );

  await new Promise<void>((resolve, reject) => {
    parser.on('end', resolve);
    parser.on('error', reject);
  });

  return handler.rows;
}

describe('row formats', function() {
  it('`columns` format emits arrays of column objects', async function() {
    const rows = await parseRows({ rowFormat: 'columns' });

    assert.lengthOf(rows, 2);

    assert.deepEqual(rows[0].map((column: any) => column.value), [1, 'first', 'second']);
    assert.strictEqual(rows[0][0].metadata.colName, 'id');
    assert.strictEqual(rows[0][1].metadata.colName, 'name');

    assert.deepEqual(rows[1].map((column: any) => column.value), [2, null, 'third']);
  });

  it('`columns` format with `useColumnNames` emits name keyed column objects, first column wins', async function() {
    const rows = await parseRows({ rowFormat: 'columns', useColumnNames: true });

    assert.lengthOf(rows, 2);

    assert.deepEqual(Object.keys(rows[0]), ['id', 'name']);
    assert.strictEqual(rows[0].id.value, 1);
    assert.strictEqual(rows[0].name.value, 'first');
    assert.strictEqual(rows[0].name.metadata.colName, 'name');

    assert.strictEqual(rows[1].id.value, 2);
    assert.strictEqual(rows[1].name.value, null);
  });

  it('`values` format emits plain value arrays', async function() {
    const rows = await parseRows({ rowFormat: 'values' });

    assert.deepEqual(rows, [
      [1, 'first', 'second'],
      [2, null, 'third']
    ]);
  });

  it('`values` format with `useColumnNames` emits name keyed values, first column wins', async function() {
    const rows = await parseRows({ rowFormat: 'values', useColumnNames: true });

    assert.lengthOf(rows, 2);

    assert.deepEqual(Object.keys(rows[0]), ['id', 'name']);
    assert.strictEqual(rows[0].id, 1);
    assert.strictEqual(rows[0].name, 'first');

    assert.strictEqual(rows[1].id, 2);
    assert.strictEqual(rows[1].name, null);
  });

  it('defaults to the `columns` format', async function() {
    const rows = await parseRows({});

    assert.deepEqual(rows[0].map((column: any) => column.value), [1, 'first', 'second']);
    assert.strictEqual(rows[0][0].metadata.colName, 'id');
  });
});
