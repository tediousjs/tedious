const { createBenchmark } = require('../common');
const { Readable } = require('stream');

const Debug = require('tedious/lib/debug');
const MessageIO = require('tedious/lib/message-io');
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

  (async function() {
    bench.start();
    console.profile('read-message');

    let total = 0;
    for (let i = 0; i < n; i++) {
      for await (const chunk of MessageIO.readMessage(stream, debug)) {
        total += chunk.length;
      }
    }

    console.profileEnd('read-message');
    bench.end(n);
  })();
}
