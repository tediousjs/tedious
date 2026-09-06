// Measures the serialization throughput of a table-valued parameter whose
// rows are given as an array, consumed the way `Connection.makeRequest`
// consumes a payload (through `Readable.from`). Reports rows per second.
//
//     node benchmarks/parameters/tvp-rows.js

const { createBenchmark } = require('../common');
const { Readable } = require('stream');

const RpcRequestPayload = require('tedious/lib/rpcrequest-payload');
const { typeByName: TYPES, resolveParameter } = require('tedious/lib/data-type');

const bench = createBenchmark(main, {
  rows: [1000, 100000, 1000000],
  n: [3]
});

const options = { tdsVersion: '7_4', useUTC: true };
const txnDescriptor = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);

const columns = [
  { name: 'user_id', type: TYPES.Int },
  { name: 'user_name', type: TYPES.NVarChar, length: 50 },
  { name: 'user_enabled', type: TYPES.Bit }
];

function buildRows(count) {
  const rows = new Array(count);
  for (let i = 0; i < count; i++) {
    rows[i] = [i, 'user ' + i, (i & 1) === 0];
  }
  return rows;
}

function main({ rows: rowCount, n }) {
  const rows = buildRows(rowCount);
  const parameter = { type: TYPES.TVP, name: 'tvp', value: { name: 'UserType', columns, rows }, output: false };

  let i = 0;
  bench.start();

  (function next() {
    if (i++ === n) {
      bench.end(rowCount * n);
      return;
    }

    const payload = new RpcRequestPayload('proc', [resolveParameter(parameter, undefined, options)], txnDescriptor, options);
    const stream = Readable.from(payload);
    stream.on('data', () => {});
    stream.on('end', next);
  })();
}
