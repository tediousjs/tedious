// Measures the serialization throughput of table-valued parameters.
//
// Set TEDIOUS_LIB to benchmark a different build (e.g. a released version) and
// TEDIOUS_SPIKE_TVP_GRANULARITY=cell to yield per cell instead of per row.
//
//     node benchmarks/parameters/tvp-rows.js

const { createBenchmark } = require('../common');

const lib = process.env.TEDIOUS_LIB || 'tedious/lib';
const RpcRequestPayload = require(lib + '/rpcrequest-payload');
const { typeByName: TYPES } = require(lib + '/data-type');

const bench = createBenchmark(main, {
  n: [10],
  rows: [10000],
  source: ['array', 'async']
});

const options = { tdsVersion: '7_4', useUTC: true };
const txnDescriptor = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);

const columns = [
  { name: 'id', type: TYPES.Int },
  { name: 'name', type: TYPES.NVarChar, length: 50 },
  { name: 'created', type: TYPES.DateTime }
];

function buildRows(count) {
  const rows = [];
  const date = new Date();
  for (let i = 0; i < count; i++) {
    rows.push([i, 'row ' + i, date]);
  }
  return rows;
}

async function main({ n, rows, source }) {
  const rowData = buildRows(rows);

  bench.start();

  for (let i = 0; i < n; i++) {
    const rowSource = source === 'async'
      ? (async function*() { yield* rowData; })()
      : rowData;

    const value = TYPES.TVP.validate({ name: 'BenchType', columns, rows: rowSource }, undefined);
    const parameter = { type: TYPES.TVP, name: 'tvp', value, output: false };
    const payload = new RpcRequestPayload('proc', [parameter], txnDescriptor, options, undefined);

    let bytes = 0;
    for await (const chunk of payload) {
      bytes += chunk.length;
    }
    if (bytes === 0) {
      throw new Error('no data');
    }
  }

  bench.end(n * rows);
}
