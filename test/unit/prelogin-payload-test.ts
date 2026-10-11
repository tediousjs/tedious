import PreloginPayload from '../../src/prelogin-payload';
import { ConnectionError } from '../../src/errors';
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

  for (const length of [0, 2, 0xFFFF]) {
    it(`rejects an ENCRYPTION option with length ${length}`, function() {
      const data = new PreloginPayload().data;
      data.writeUInt16BE(length, 8);
      assert.throws(() => new PreloginPayload(data), ConnectionError, 'Malformed ENCRYPTION option');
    });
  }

  for (const offset of [0, 5, 35, 0xFFFF]) {
    it(`rejects an ENCRYPTION option with invalid offset ${offset}`, function() {
      const data = new PreloginPayload().data;
      data.writeUInt16BE(offset, 6);
      assert.throws(() => new PreloginPayload(data), ConnectionError, 'Malformed ENCRYPTION option');
    });
  }

  it('rejects an ENCRYPTION offset at the end of the payload', function() {
    const data = new PreloginPayload().data;
    data.writeUInt16BE(data.length, 6);
    assert.throws(() => new PreloginPayload(data), ConnectionError, 'Malformed ENCRYPTION option');
  });

  for (const encryption of [0, 1, 2, 3]) {
    it(`rejects duplicate ENCRYPTION options ending with ${encryption}`, function() {
      const data = new PreloginPayload().data;
      // Replace the one-byte MARS option with a second ENCRYPTION option.
      data.writeUInt8(0x01, 20);
      data.writeUInt8(encryption, data.readUInt16BE(21));
      assert.throws(() => new PreloginPayload(data), ConnectionError, 'Duplicate ENCRYPTION option');
    });
  }

  it('allows omitted ENCRYPTION for callers that do not require negotiation', function() {
    const data = Buffer.from([
      0x00, 0x00, 0x06, 0x00, 0x06, 0xFF,
      0x01, 0x02, 0x00, 0x03, 0x00, 0x04
    ]);
    const payload = new PreloginPayload(data);
    assert.deepEqual(payload.version, { major: 1, minor: 2, build: 3, subbuild: 4 });
    assert.isUndefined(payload.encryption);
    assert.isUndefined(payload.encryptionString);
  });

  it('accepts an empty server THREADID option alongside ENCRYPTION', function() {
    const data = new PreloginPayload().data;
    data.writeUInt16BE(0, 18);
    const payload = new PreloginPayload(data);
    assert.isUndefined(payload.threadId);
    assert.strictEqual(payload.encryptionString, 'NOT_SUP');
  });

  it('leaves an unknown ENCRYPTION value unmapped', function() {
    const data = new PreloginPayload().data;
    data.writeUInt8(0x04, data.readUInt16BE(6));
    const payload = new PreloginPayload(data);
    assert.strictEqual(payload.encryption, 0x04);
    assert.isUndefined(payload.encryptionString);
  });
});
