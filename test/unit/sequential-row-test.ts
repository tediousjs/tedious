import { assert } from 'chai';

import Debug from '../../src/debug';
import { Parser } from '../../src/token/token-stream-parser';
import { type ParserOptions } from '../../src/token/stream-parser';
import { TokenHandler } from '../../src/token/handler';
import { SequentialRow } from '../../src/sequential-row';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';

const COLLATION = Buffer.from('0904d00034', 'hex');

// COLMETADATA: [id] int, [content] nvarchar(max), [name] nvarchar(30)
function writeColMetadata(buf: WritableTrackingBuffer) {
  buf.writeUInt8(0x81);
  buf.writeUInt16LE(3);

  buf.writeUInt32LE(0);
  buf.writeUInt16LE(8);
  buf.writeUInt8(0x38); // INT4
  buf.writeBVarchar('id', 'ucs2');

  buf.writeUInt32LE(0);
  buf.writeUInt16LE(8);
  buf.writeUInt8(0xE7); // NVARCHAR
  buf.writeUInt16LE(0xFFFF); // MAX
  buf.writeBuffer(COLLATION);
  buf.writeBVarchar('content', 'ucs2');

  buf.writeUInt32LE(0);
  buf.writeUInt16LE(8);
  buf.writeUInt8(0xE7); // NVARCHAR
  buf.writeUInt16LE(60);
  buf.writeBuffer(COLLATION);
  buf.writeBVarchar('name', 'ucs2');
}

function writePLPValue(buf: WritableTrackingBuffer, value: string | null, chunkSize = 12) {
  if (value === null) {
    buf.writeBuffer(Buffer.from('ffffffffffffffff', 'hex')); // PLP_NULL
    return;
  }

  const payload = Buffer.from(value, 'ucs2');
  buf.writeBigUInt64LE(BigInt(payload.length));
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.subarray(i, i + chunkSize);
    buf.writeUInt32LE(chunk.length);
    buf.writeBuffer(chunk);
  }
  buf.writeUInt32LE(0);
}

function writeNVarChar(buf: WritableTrackingBuffer, value: string) {
  buf.writeUInt16LE(value.length * 2);
  buf.writeString(value, 'ucs2');
}

function buildTokenStream() {
  const buf = new WritableTrackingBuffer(1024, null, true);
  writeColMetadata(buf);

  // row 1: 1, 'long plp content here', 'one'
  buf.writeUInt8(0xD1);
  buf.writeInt32LE(1);
  writePLPValue(buf, 'long plp content here');
  writeNVarChar(buf, 'one');

  // row 2: 2, NULL (PLP null), 'two'
  buf.writeUInt8(0xD1);
  buf.writeInt32LE(2);
  writePLPValue(buf, null);
  writeNVarChar(buf, 'two');

  // row 3 (NBCROW): 3, NULL (bitmap), NULL (bitmap)
  buf.writeUInt8(0xD2);
  buf.writeUInt8(0b110);
  buf.writeInt32LE(3);

  // row 4: 4, 'last row content', 'four'
  buf.writeUInt8(0xD1);
  buf.writeInt32LE(4);
  writePLPValue(buf, 'last row content');
  writeNVarChar(buf, 'four');

  // DONE
  buf.writeUInt8(0xFD);
  buf.writeUInt16LE(0);
  buf.writeUInt16LE(0);
  buf.writeBigUInt64LE(0n);

  return buf.data;
}

/**
 * Drives a parser in sequential row mode, processing each row with the
 * given function while the parse loop waits.
 */
async function parseSequential(chunkSize: number, processRow: (row: SequentialRow, index: number) => Promise<unknown>): Promise<unknown[]> {
  const data = buildTokenStream();

  async function * chunks() {
    for (let i = 0; i < data.length; i += chunkSize) {
      yield Buffer.from(data.subarray(i, i + chunkSize));
    }
  }

  const results: unknown[] = [];
  let processing = Promise.resolve();
  let rowIndex = 0;

  class Handler extends TokenHandler {
    onColMetadata() {}
    onDone() {}
    onRow(row: unknown) {
      const index = rowIndex++;
      processing = processing.then(async () => {
        results.push(await processRow(row as SequentialRow, index));
        await (row as SequentialRow).finish();
      });
    }
  }

  const parser = new Parser(chunks(), new Debug(), new Handler(), { tdsVersion: '7_4', useUTC: true, useColumnNames: false } as ParserOptions, { streamRows: true });

  await new Promise<void>((resolve, reject) => {
    parser.on('end', resolve);
    parser.on('error', reject);
  });
  await processing;

  return results;
}

describe('sequential rows', function() {
  for (const chunkSize of [1024 * 1024, 13, 3]) {
    describe(`with ${chunkSize} byte network chunks`, function() {
      it('materializes values accessed in order', async function() {
        const results = await parseSequential(chunkSize, async (row) => {
          return [await row.value(0), await row.value(1), await row.value(2)];
        });

        assert.deepEqual(results, [
          [1, 'long plp content here', 'one'],
          [2, null, 'two'],
          [3, null, null],
          [4, 'last row content', 'four']
        ]);
      });

      it('streams PLP values as chunks', async function() {
        const results = await parseSequential(chunkSize, async (row) => {
          const id = await row.value(0);

          const stream = await row.stream(1);
          let content = null;
          if (stream !== null) {
            const chunks = [];
            for await (const chunk of stream) {
              chunks.push(chunk);
            }
            content = Buffer.concat(chunks).toString('ucs2');
          }

          return [id, content, await row.value(2)];
        });

        assert.deepEqual(results, [
          [1, 'long plp content here', 'one'],
          [2, null, 'two'],
          [3, null, null],
          [4, 'last row content', 'four']
        ]);
      });

      it('skips unconsumed and abandoned values', async function() {
        const results = await parseSequential(chunkSize, async (row, index) => {
          if (index === 0) {
            // skip over the PLP column entirely
            return [await row.value(0), await row.value(2)];
          }

          if (index === 3) {
            // start streaming, then abandon mid-value
            const id = await row.value(0);
            const stream = await row.stream(1);
            if (stream !== null) {
              for await (const chunk of stream) {
                void chunk;
                break;
              }
            }
            return [id, await row.value(2)];
          }

          // consume nothing - the row is drained on advance
          return [await row.value(0)];
        });

        assert.deepEqual(results, [
          [1, 'one'],
          [2],
          [3],
          [4, 'four']
        ]);
      });

      it('caches non-PLP values and rejects access to consumed PLP cells', async function() {
        await parseSequential(chunkSize, async (row, index) => {
          if (index !== 0) {
            return null;
          }

          assert.strictEqual(await row.value(2), 'one'); // skips the PLP column
          assert.strictEqual(await row.value(0), 1); // cached earlier value

          let error;
          try {
            await row.value(1);
          } catch (err: any) {
            error = err;
          }
          assert.match(error.message, /already consumed/);

          return null;
        });
      });

      it('rejects streaming of non-PLP columns', async function() {
        await parseSequential(chunkSize, async (row, index) => {
          if (index !== 0) {
            return null;
          }

          let error;
          try {
            await row.stream(0);
          } catch (err: any) {
            error = err;
          }
          assert.instanceOf(error, TypeError);

          return null;
        });
      });
    });
  }
});
