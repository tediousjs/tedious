// Measures the serialization throughput of RPC requests with scalar parameters.
//
//     node benchmarks/parameters/scalar-params.js

const { createBenchmark } = require('../common');

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

  bench.start();

  for (let i = 0; i < n; i++) {
    // Resolution happens once per request, as `Request.validateParameters` does.
    const resolved = parameters.map((parameter) => resolveParameter(parameter, undefined, options));
    const payload = new RpcRequestPayload('proc', resolved, txnDescriptor, options);

    let bytes = 0;
    for (const chunk of payload) {
      bytes += chunk.length;
    }
    if (bytes === 0) {
      throw new Error('no data');
    }
  }

  bench.end(n);
}
