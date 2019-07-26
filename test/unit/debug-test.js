const Debug = require('../../src/debug');
const payload = 'payload';
const assert = require('chai').assert;

class Packet {
  headerToString() {
    return 'header';
  }

  dataToString() {
    return 'data';
  }
}

describe('Packet Tests', () => {
  it('Create new packet', (done) => {
    let emitCount = 0;

    const debug = new Debug({ packet: true });

    debug.on('debug', function (text) {
      emitCount++;

      switch (emitCount) {
        case 2:
          assert.isOk(/dir/.test(text));
          break;
        case 3:
          assert.isOk(/header/.test(text));
          done();
          break;
      }
    });

    return debug.packet('dir', new Packet());
  })

  it('should enable payload', (done) => {
    const debug = new Debug({ payload: true });
    debug.on('debug', function (text) {
      assert.strictEqual(text, payload);

      done();
    });

    return debug.payload(function () {
      return payload;
    });
  })

  it('should not enable payload', (done) => {
    const debug = new Debug();
    debug.on('debug', function (text) {
      assert.isOk(false);
    });

    debug.payload(payload);

    done();
  })

  it('should enable data', (done) => {
    const debug = new Debug({ data: true });
    debug.on('debug', function (text) {
      assert.strictEqual(text, 'data');

      done();
    });

    debug.data(new Packet());
  })

  it('should not enable data', (done) => {
    const debug = new Debug();
    debug.on('debug', function (text) {
      assert.isOk(false);
    });

    debug.data(new Packet());

    done();
  })

  it('should enable token', (done) => {
    const debug = new Debug({ token: true });
    debug.on('debug', function (token) {
      assert.isOk(token.indexOf('test') !== 0);

      done();
    });

    debug.token({ name: 'test' });
  })

  it('should not enable payload', (done) => {
    const debug = new Debug();
    debug.on('debug', function (token) {
      assert.isOk(false);
    });

    debug.token({ name: 'test' });

    done();
  })
})
