const { createBenchmark } = require('../common');

const { Request, TYPES } = require('../../lib/tedious');
const RpcRequestPayload = require('../../lib/rpcrequest-payload');

const bench = createBenchmark(main, {
  n: [10, 100],
  size: [
    1024 * 1024,
    10 * 1024 * 1024,
    50 * 1024 * 1024
  ]
});

function main({ n, size }) {
  const buf = Buffer.alloc(size);
  buf.fill('x');

  const request = new Request('INSERT INTO #benchmark ([value]) VALUES (@value)', () => {});
  request.addParameter('value', TYPES.VarBinary, buf);

  let i = 0;
  bench.start();

  (function cb() {
    if (i++ === n) {
      bench.end(n);
      return;
    }

    const payload = new RpcRequestPayload(request, Buffer.alloc(0), {});
    const stream = payload.getStream();
    const chunks = [];
    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });
    stream.on('end', cb);
  })();
}
