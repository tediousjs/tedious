const { createBenchmark } = require('../common');

const { Request, TYPES } = require('../../lib/tedious');
const RpcRequestPayload = require('../../lib/rpcrequest-payload');

const bench = createBenchmark(main, {
  n: [10, 100],
  size: [
    1024 * 1024,
    10 * 1024 * 1024,
    50 * 1024 * 1024,
  ]
});

function main({ n, size }) {
  const buf = Buffer.alloc(size);
  buf.fill('x');

  var table = {
    columns: [
      {name: 'user_id', type: TYPES.Int},
      {name: 'user_name', type: TYPES.VarChar, length: 500},
      {name: 'user_enabled', type: TYPES.Bit}
    ],
    rows: [
      [15, 'Eric', true],
      [16, 'John', false]
    ]
  };

  const request = new Request('INSERT INTO #benchmark ([value]) VALUES (@value)', () => {});
  request.addParameter('value', TYPES.TVP, table);

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
