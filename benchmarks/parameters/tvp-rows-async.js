// Measures the serialization throughput of a table-valued parameter whose
// rows come from an async iterable, consumed the way
// `Connection.makeRequest` consumes a payload. Reports rows per second.
//
//     node benchmarks/parameters/tvp-rows-async.js

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

async function * generateRows(count) {
  for (let i = 0; i < count; i++) {
    yield [i, 'user ' + i, (i & 1) === 0];
  }
}

function main({ rows: rowCount, n }) {
  let i = 0;
  bench.start();

  (function next() {
    if (i++ === n) {
      bench.end(rowCount * n);
      return;
    }

    const parameter = { type: TYPES.TVP, name: 'tvp', value: { name: 'UserType', columns, rows: generateRows(rowCount) }, output: false };
    const payload = new RpcRequestPayload('proc', [resolveParameter(parameter, undefined, options)], txnDescriptor, options);
    const stream = Readable.from(payload);
    stream.on('data', () => {});
    stream.on('end', next);
  })();
}
