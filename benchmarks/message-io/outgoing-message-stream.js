const { createBenchmark } = require('../common');
const { Duplex } = require('stream');

const Debug = require('tedious/lib/debug');
const OutgoingMessageStream = require('tedious/lib/outgoing-message-stream');
const Message = require('tedious/lib/message');

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

  const out = new OutgoingMessageStream(debug, {
    packetSize: 8 + 1024
  });
  out.pipe(stream);

  bench.start();

  function writeNextMessage(i) {
    if (i === n) {
      out.end();
      out.once('finish', () => {
        bench.end(n);
      });
      return;
    }

    const message = new Message({ type: 2, resetConnection: false });
    out.write(message);

    for (const chunk of payload) {
      message.write(chunk);
    }

    message.end();

    if (out.needsDrain) {
      out.once('drain', () => {
        writeNextMessage(i + 1);
      });
    } else {
      process.nextTick(() => {
        writeNextMessage(i + 1);
      });
    }
  }

  writeNextMessage(0);
}
