const { createBenchmark } = require('../common');

const { Parser } = require('../../parser');

const bench = createBenchmark(main, {
  n: [10, 100, 1000],
  tokenCount: [10, 100, 1000, 10000]
});

async function * repeat(data, n) {
  for (let i = 0; i < n; i++) {
    yield data;
  }
}

function main({ n, tokenCount }) {
  const data = Buffer.from('FE0000E0000000000000000000'.repeat(tokenCount), 'hex');
  const parser = new Parser({
    onDoneProc(token) {}
  });


  bench.start();

  (async () => {
    for await (const chunk of repeat(data, n)) {
      parser.parse(chunk);
    }

    bench.end(n);
  })()
}
