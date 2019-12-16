const PreloginPayload = require('../../src/prelogin-payload');
const assert = require('chai').assert;

function assertPayload(payload, encryptionString) {
  assert.strictEqual(payload.version.major, 0);
  assert.strictEqual(payload.version.minor, 0);
  assert.strictEqual(payload.version.patch, 0);
  assert.strictEqual(payload.version.trivial, 1);
  assert.strictEqual(payload.version.subbuild, 1);

  assert.strictEqual(payload.encryptionString, encryptionString);
  assert.strictEqual(payload.instance, 0);
  assert.strictEqual(payload.threadId, 0);
  assert.strictEqual(payload.marsString, 'OFF');
  assert.strictEqual(payload.fedAuthRequired, 1);
}

describe('prelogin-payload-assert', function() {
  it('should not encrypt', function() {
    const payload = new PreloginPayload();
    assertPayload(payload, 'NOT_SUP');
  });

  it('should encrypt', function() {
    const payload = new PreloginPayload({ encrypt: true });
    assertPayload(payload, 'ON');
  });

  it('should create from buffer', function() {
    const payload = new PreloginPayload();
    new PreloginPayload(payload.data);
    assertPayload(payload, 'NOT_SUP');
  });
});
