import PreloginPayload from '../../src/prelogin-payload';
import { assert } from 'chai';

interface Version {
  major: number;
  minor: number;
  build: number;
  subbuild: number;
}

function assertPayload(payload: PreloginPayload, encryptionString: string, { major, minor, build, subbuild }: Version) {
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

describe('PreloginPayload', function() {
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

  describe('#toString', function() {
    it('formats the payload as zero-padded upper-case hex', function() {
      const payload = new PreloginPayload({ encrypt: true, version: { major: 11, minor: 3, build: 2, subbuild: 0 } });
      payload.traceId = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');

      assert.strictEqual(payload.toString('--'),
                         '--PreLogin - version:11.3.2.0, encryption:0x01(ON), instopt:0x00, threadId:0x00000000, mars:0x00(OFF), traceId:000102030405060708090a0b0c0d0e0f');
    });

    it('formats an unencrypted payload', function() {
      const payload = new PreloginPayload();
      payload.traceId = Buffer.from('ff', 'hex');

      assert.strictEqual(payload.toString(),
                         'PreLogin - version:0.0.0.0, encryption:0x02(NOT_SUP), instopt:0x00, threadId:0x00000000, mars:0x00(OFF), traceId:ff');
    });
  });
});
