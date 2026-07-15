import Debug from '../../src/debug';
import { Packet } from '../../src/packet';
import { Token } from '../../src/token/token';
import { assert } from 'chai';

const payload = 'payload';

// Mock Packet class that provides minimal implementation for debug tests
class MockPacket {
  headerToString(): string {
    return 'header';
  }

  dataToString(): string {
    return 'data';
  }
}

describe('Debug', function() {
  it('should emit debug events when sending a packet', function(done) {
    let emitCount = 0;

    const debug = new Debug({ packet: true });

    debug.on('debug', function(text) {
      emitCount++;

      switch (emitCount) {
        case 2:
          assert.match(text, /Sent/);
          break;
        case 3:
          assert.match(text, /header/);
          done();
          break;
      }
    });

    return debug.packet('Sent', new MockPacket() as Packet);
  });

  it('should enable payload', function(done) {
    const debug = new Debug({ payload: true });
    debug.on('debug', function(text) {
      assert.strictEqual(text, payload);

      done();
    });

    return debug.payload(function() {
      return payload;
    });
  });

  it('should not emit payload debug events when disabled', function(done) {
    const debug = new Debug();
    debug.on('debug', function() {
      assert.fail('Expected no debug event to be emitted');
    });

    debug.payload(() => payload);

    done();
  });

  it('should enable data', function(done) {
    const debug = new Debug({ data: true });
    debug.on('debug', function(text) {
      assert.strictEqual(text, 'data');

      done();
    });

    debug.data(new MockPacket() as Packet);
  });

  it('should not emit data debug events when disabled', function(done) {
    const debug = new Debug();
    debug.on('debug', function() {
      assert.fail('Expected no debug event to be emitted');
    });

    debug.data(new MockPacket() as Packet);

    done();
  });

  it('should enable token', function(done) {
    const debug = new Debug({ token: true });
    debug.on('debug', function(token) {
      assert.isFalse(token.startsWith('test'));

      done();
    });

    debug.token({ name: 'test' } as Token);
  });

  it('should not emit token debug events when disabled', function(done) {
    const debug = new Debug();
    debug.on('debug', function() {
      assert.fail('Expected no debug event to be emitted');
    });

    debug.token({ name: 'test' } as Token);

    done();
  });
});
