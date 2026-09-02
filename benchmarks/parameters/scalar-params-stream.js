// Measures the serialization throughput of RPC requests with scalar
// parameters, consumed the way `Connection.makeRequest` consumes a payload
// (through `Readable.from`).
//
//     node benchmarks/parameters/scalar-params-stream.js

const { createBenchmark } = require('../common');
const { Readable } = require('stream');

const RpcRequestPayload = require('tedious/lib/rpcrequest-payload');
const { typeByName: TYPES, resolveParameter } = require('tedious/lib/data-type');

const bench = createBenchmark(main, {
  n: [20000]
});

const options = { tdsVersion: '7_4', useUTC: true };
const txnDescriptor = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);

function buildParameters() {
  const parameters = [];
  for (let i = 0; i < 4; i++) {
    parameters.push({ type: TYPES.Int, name: 'int' + i, value: i, output: false });
    parameters.push({ type: TYPES.NVarChar, name: 'str' + i, value: 'value ' + i, output: false });
    parameters.push({ type: TYPES.VarBinary, name: 'bin' + i, value: Buffer.alloc(16, i), output: false });
    parameters.push({ type: TYPES.DateTime, name: 'date' + i, value: new Date(), output: false });
    parameters.push({ type: TYPES.Decimal, name: 'dec' + i, value: 1.5 * i, precision: 10, scale: 4, output: false });
  }
  return parameters;
}

function main({ n }) {
  const parameters = buildParameters();

  let i = 0;
  bench.start();

  (function next() {
    if (i++ === n) {
      bench.end(n);
      return;
    }

    const resolved = parameters.map((parameter) => resolveParameter(parameter, undefined, options));
    const payload = new RpcRequestPayload('proc', resolved, txnDescriptor, options);
    const stream = Readable.from(payload);
    stream.on('data', () => {});
    stream.on('end', next);
  })();
}
