const PreloginPayload = require('../../src/prelogin-payload');
const assert = require('chai').assert;

function assertPayload(payload, encryptionString, { major, minor, build, subbuild }) {
  assert.strictEqual(payload.version.major, major);
  assert.strictEqual(payload.version.minor, minor);
  assert.strictEqual(payload.version.build, build);
  assert.strictEqual(payload.version.subbuild, subbuild);

  assert.strictEqual(payload.encryptionString, encryptionString);
  assert.strictEqual(payload.instance, 0);
  assert.strictEqual(payload.threadId, 0);
  assert.strictEqual(payload.marsString, 'OFF');
  assert.strictEqual(payload.fedAuthRequired, 1);
}

describe('prelogin-payload-assert', function() {
  it('should not encrypt', function() {
    const payload = new PreloginPayload();
    assertPayload(payload, 'NOT_SUP', { major: 0, minor: 0, build: 0, subbuild: 0 });
  });

  it('should encrypt', function() {
    const payload = new PreloginPayload({ encrypt: true, version: { major: 11, minor: 3, build: 2, subbuild: 0 } });
    assertPayload(payload, 'ON', { major: 11, minor: 3, build: 2, subbuild: 0 });
  });

  it('should create from buffer', function() {
    const payload = new PreloginPayload();
    new PreloginPayload(payload.data);
    assertPayload(payload, 'NOT_SUP', { major: 0, minor: 0, build: 0, subbuild: 0 });
  });
});
