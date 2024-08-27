const { createBenchmark, createConnection } = require('../common');
const { Duplex } = require('stream');

const Debug = require('tedious/lib/debug');
const MessageIO = require('tedious/lib/message-io');

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
    console.profile('write-message');

    for (let i = 0; i <= n; i++) {
      await MessageIO.writeMessage(stream, debug, 8 + 1024, 2, payload);
    }

    console.profileEnd('write-message');
    bench.end(n);
  })();
}
