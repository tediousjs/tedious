import Debug from '../../src/debug';
import { assert } from 'chai';

const payload = 'payload';

class Packet {
  headerToString(): string {
    return 'header';
  }

  dataToString(): string {
    return 'data';
  }
}

describe('Packet Tests', function() {
  it('Create new packet', function(done) {
    let emitCount = 0;

    const debug = new Debug({ packet: true });

    debug.on('debug', function(text) {
      emitCount++;

      switch (emitCount) {
        case 2:
          assert.isOk(/Sent/.test(text));
          break;
        case 3:
          assert.isOk(/header/.test(text));
          done();
          break;
      }
    });

    return debug.packet('Sent', new Packet() as any);
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

  it('should not enable payload', function(done) {
    const debug = new Debug();
    debug.on('debug', function() {
      assert.isOk(false);
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

    debug.data(new Packet() as any);
  });

  it('should not enable data', function(done) {
    const debug = new Debug();
    debug.on('debug', function() {
      assert.isOk(false);
    });

    debug.data(new Packet() as any);

    done();
  });

  it('should enable token', function(done) {
    const debug = new Debug({ token: true });
    debug.on('debug', function(token) {
      assert.isOk(token.indexOf('test') !== 0);

      done();
    });

    debug.token({ name: 'test' } as any);
  });

  it('should not enable payload', function(done) {
    const debug = new Debug();
    debug.on('debug', function() {
      assert.isOk(false);
    });

    debug.token({ name: 'test' } as any);

    done();
  });
});
