// Measures the throughput of `WritableTrackingBuffer` for the kind of data a
// request payload is made of: many small fixed-width values, short strings,
// and the occasional buffer.
//
//     node benchmarks/tracking-buffer/writable-tracking-buffer.js

const { createBenchmark } = require('../common');

const WritableTrackingBuffer = require('tedious/lib/tracking-buffer/writable-tracking-buffer');

const bench = createBenchmark(main, {
  n: [100000],
  pieces: [10, 100, 1000]
});

const payload = Buffer.alloc(16, 0x42);

function main({ n, pieces }) {
  bench.start();

  for (let i = 0; i < n; i++) {
    const buffer = new WritableTrackingBuffer();

    for (let j = 0; j < pieces; j++) {
      buffer.writeUInt8(0x01);
      buffer.writeUInt16LE(j);
      buffer.writeInt32LE(-j);
      buffer.writeBVarchar('@param' + j, 'ucs2');
      buffer.writeBuffer(payload);
    }

    if (buffer.data.length === 0) {
      throw new Error('no data');
    }
  }

  bench.end(n);
}
