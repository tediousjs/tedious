const { createBenchmark } = require('../common');
const { Duplex } = require('stream');

const Debug = require('tedious/lib/debug');
const { writeMessage } = require('tedious/lib/message-io');

const bench = createBenchmark(main, {
  n: [100, 1000, 10000, 100000]
});

function main({ n }) {
  const debug = new Debug();

  const stream = new Duplex({
    read() {},
    write(chunk, encoding, callback) {
      // Just consume the data
      callback();
    }
  });

  const payload = [
    Buffer.alloc(1024),
    Buffer.alloc(1024),
    Buffer.alloc(1024),
    Buffer.alloc(256),
    Buffer.alloc(256),
    Buffer.alloc(256),
    Buffer.alloc(256),
  ];

  (async function() {
    bench.start();

    for (let i = 0; i < n; i++) {
      await writeMessage(stream, 8 + 1024, 2, payload, { debug });
    }

    bench.end(n);
  })();
}
