import { assert } from 'chai';

import IncomingMessage, { type MessageSink } from '../../src/incoming-message';

class RecordingSink implements MessageSink {
  chunks: string[] = [];
  ended = false;
  accept = true;

  push(data: Buffer) {
    this.chunks.push(data.toString());
    return this.accept;
  }

  end() {
    this.ended = true;
  }
}

describe('IncomingMessage', function() {
  it('delivers data written before and after a sink is attached, in order', function() {
    const message = new IncomingMessage({ type: 0x04 });
    const sink = new RecordingSink();

    assert.isTrue(message.write(Buffer.from('a')));
    assert.isTrue(message.write(Buffer.from('b')));

    message.attach(sink);
    assert.deepEqual(sink.chunks, ['ab']);

    assert.isTrue(message.write(Buffer.from('c')));
    message.end();

    assert.deepEqual(sink.chunks, ['ab', 'c']);
    assert.isTrue(sink.ended);
  });

  it('holds the writer back while the sink is stalled', function() {
    const message = new IncomingMessage({ type: 0x04 });
    const sink = new RecordingSink();
    message.attach(sink);

    sink.accept = false;
    assert.isFalse(message.write(Buffer.from('a')));
    assert.isTrue(message.stalled);

    let drained = false;
    message.onDrain = () => { drained = true; };

    sink.accept = true;
    message.continueSink();

    assert.isFalse(message.stalled);
    assert.isTrue(drained);
  });

  it('queues data written while stalled behind data buffered before the sink attached', function() {
    const message = new IncomingMessage({ type: 0x04 });
    const sink = new RecordingSink();

    // Two separately buffered chunks; the sink stalls after the first.
    message.write(Buffer.from('a'));
    message.write(Buffer.from('b'));
    sink.accept = false;

    // `attach` reads the buffered data in one go and stalls.
    message.attach(sink);
    assert.deepEqual(sink.chunks, ['ab']);
    assert.isTrue(message.stalled);

    // Data written while stalled must not overtake anything, and must
    // hold the writer back.
    assert.isFalse(message.write(Buffer.from('c')));
    message.end();
    assert.deepEqual(sink.chunks, ['ab']);
    assert.isFalse(sink.ended);

    let drained = false;
    message.onDrain = () => { drained = true; };

    sink.accept = true;
    message.continueSink();

    assert.deepEqual(sink.chunks, ['ab', 'c']);
    assert.isTrue(sink.ended);
    assert.isTrue(drained);
  });

  it('delivers the end of the message once the sink is no longer stalled', function() {
    const message = new IncomingMessage({ type: 0x04 });
    const sink = new RecordingSink();
    message.attach(sink);

    sink.accept = false;
    assert.isFalse(message.write(Buffer.from('a')));
    message.end();
    assert.isFalse(sink.ended);

    sink.accept = true;
    message.continueSink();
    assert.isTrue(sink.ended);
  });

  it('can be consumed as a readable stream', async function() {
    const message = new IncomingMessage({ type: 0x04 });

    message.write(Buffer.from('a'));
    message.write(Buffer.from('b'));
    message.end();

    const chunks: string[] = [];
    for await (const chunk of message) {
      chunks.push(chunk.toString());
    }

    assert.deepEqual(chunks.join(''), 'ab');
  });
});
