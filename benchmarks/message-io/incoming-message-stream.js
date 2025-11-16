const { createBenchmark } = require('../common');
const { Readable } = require('stream');

const Debug = require('tedious/lib/debug');
const IncomingMessageStream = require('tedious/lib/incoming-message-stream');
const { Packet } = require('tedious/lib/packet');

const bench = createBenchmark(main, {
  n: [100, 1000, 10000, 100000]
});

function main({ n }) {
  const debug = new Debug();

  const stream = Readable.from((async function*() {
    for (let i = 0; i < n; i++) {
      const packet = new Packet(2);
      packet.last(true);
      packet.addData(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]));

      yield packet.buffer;
    }
  })());

  const incoming = new IncomingMessageStream(debug);
  stream.pipe(incoming);

  bench.start();
  console.profile('incoming-message-stream');

  (async function() {
    let total = 0;

    for await (m of incoming) {
      for await (const buf of m) {
        total += buf.length;
      }
    }

    console.profileEnd('incoming-message-stream');
    bench.end(n);
  })();
}
