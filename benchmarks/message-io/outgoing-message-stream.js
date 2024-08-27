const { createBenchmark } = require('../common');
const { Duplex } = require('stream');

const Debug = require('../../lib/debug');
const OutgoingMessageStream = require('../../lib/outgoing-message-stream');
const Message = require('../../lib/message');

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
  console.profile('write-message');

  function writeNextMessage(i) {
    if (i == n) {
      out.end();
      out.once('finish', () => {
        console.profileEnd('write-message');
        bench.end(n);
      });
      return;
    }

    const m = new Message({ type: 2, resetConnection: false });
    out.write(m);

    for (const buf of payload) {
      m.write(buf);
    }

    m.end();

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
