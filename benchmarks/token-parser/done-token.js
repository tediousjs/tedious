const { createBenchmark } = require('../common');

const { Parser } = require('../../src/token/token-stream-parser');
const { AzurePowerShellCredential } = require('@azure/identity');

const bench = createBenchmark(main, {
  n: [100, 1000],
  tokenCount: [10, 100, 1000, 10000],
  packetLength: [512, 4096, 32767]
});

/**
 * @param {Buffer} data
 * @param {number} n
 * @param {number} chunkSize
 */
async function* repeat(data, n, chunkSize) {
  for (let i = 0; i < n; i++) {
    let offset = 0

    while (offset + chunkSize <= data.length) {
      yield data.slice(offset, offset += chunkSize);
    }

    if (offset < data.length) {
      yield data.slice(offset);
    }
  }
}

function main({ n, tokenCount, packetLength }) {
  const data = Buffer.from('FE0000E0000000000000000000'.repeat(tokenCount), 'hex');
  const parser = new Parser(repeat(data, n, packetLength), { token: function() { } }, { onDoneProc: (token) => {} }, {});

  bench.start();

  parser.on('end', () => {
    bench.end(n);
  });
}
