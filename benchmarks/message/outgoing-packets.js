// Measures how fast a message body is turned into TDS packets - the path
// every bulk load and every large parameter value goes through.

const { createBenchmark } = require('../common');

const OutgoingMessageStream = require('tedious/lib/outgoing-message-stream');
const Message = require('tedious/lib/message');
const Debug = require('tedious/lib/debug');

const bench = createBenchmark(main, {
  n: [16, 64],
  packetSize: [4096, 8192]
});

const CHUNK = Buffer.alloc(64 * 1024, 0x61);

function main({ n, packetSize }) {
  const chunkCount = (n * 1024 * 1024) / CHUNK.length;

  const stream = new OutgoingMessageStream(new Debug(), { packetSize });
  stream.on('data', () => {});

  const message = new Message({ type: 0x07, resetConnection: false });

  bench.start();

  stream.write(message, null, () => {
    bench.end(n);
  });

  let written = 0;
  (function pump() {
    while (written < chunkCount) {
      written++;

      if (!message.write(CHUNK)) {
        message.once('drain', pump);
        return;
      }
    }

    message.end();
  })();
}
