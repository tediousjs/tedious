import { assert } from 'chai';
import Message from '../../src/message';

describe('Message', function() {
  it('has a type', function() {
    const message = new Message({ type: 0x11, resetConnection: false });
    assert.strictEqual(message.type, 0x11);
  });

  it('can signal a connection reset', function() {
    let message: Message;

    message = new Message({ type: 0x11, resetConnection: false });
    assert.strictEqual(message.resetConnection, false);

    message = new Message({ type: 0x11, resetConnection: true });
    assert.strictEqual(message.resetConnection, true);
  });
});
