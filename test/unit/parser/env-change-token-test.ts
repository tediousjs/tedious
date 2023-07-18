import { assert } from 'chai';
import { EnvChangeTokenParser } from '../../../src/parser/tokens/env-change-token';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { Collation } from '../../../src/collation';


function buildToken(newValue: string|Buffer, oldValue: string|Buffer, type: number) {

  const envValueDataBuffer = new WritableTrackingBuffer(0);
  envValueDataBuffer.writeUInt8(type); // Type
  if (Buffer.isBuffer(newValue) && Buffer.isBuffer(oldValue)) {
    envValueDataBuffer.writeUInt8(newValue.length);
    envValueDataBuffer.writeBuffer(newValue);
    envValueDataBuffer.writeUInt8(oldValue.length);
    envValueDataBuffer.writeBuffer(oldValue);
  } else if (typeof newValue === 'string' && typeof oldValue === 'string') {
    envValueDataBuffer.writeBVarchar(newValue);
    envValueDataBuffer.writeBVarchar(oldValue);
  }

  const envChangeBuffer = new WritableTrackingBuffer(0);
  envChangeBuffer.writeUInt8(0xE3); // TokenType
  envChangeBuffer.writeUsVarbyte(envValueDataBuffer.data); // Length + EnvValueData

  return envChangeBuffer.data;
}

describe('EnvChangeTokenParser', function() {
  it('can parse Database Change tokens', function() {
    const oldDb = 'DataBase';
    const newDb = 'OtherDataBase';
    const data = buildToken(newDb, oldDb, 1);
    const parser = new EnvChangeTokenParser();
    const result = parser.parse(data, 1);

    assert.isTrue(result.done);
    assert.isDefined(result.value);

    const token = result.value!;

    assert.strictEqual(token.type, 'DATABASE');
    assert.strictEqual(token.oldValue, 'DataBase');
    assert.strictEqual(token.newValue, 'OtherDataBase');
  });
  it('can parse Language Change tokens', function() {
    const oldLang = 'us_english';
    const newLang = 'Italian';
    const data = buildToken(newLang, oldLang, 2);
    const parser = new EnvChangeTokenParser();
    const result = parser.parse(data, 1);

    assert.isTrue(result.done);
    assert.isDefined(result.value);

    const token = result.value!;

    assert.strictEqual(token.type, 'LANGUAGE');
    assert.strictEqual(token.oldValue, 'us_english');
    assert.strictEqual(token.newValue, 'Italian');
  });
  it('can parse Charset Change tokens', function() {
    const oldCharset = 'iso_1';
    const newCharset = 'utf8';
    const data = buildToken(newCharset, oldCharset, 3);
    const parser = new EnvChangeTokenParser();
    const result = parser.parse(data, 1);

    assert.isTrue(result.done);
    assert.isDefined(result.value);

    const token = result.value!;

    assert.strictEqual(token.type, 'CHARSET');
    assert.strictEqual(token.oldValue, 'iso_1');
    assert.strictEqual(token.newValue, 'utf8');
  });
  it('can parse packet size change tokens', function() {
    const oldSize = '1024';
    const newSize = '2048';
    const data = buildToken(newSize, oldSize, 4);
    const parser = new EnvChangeTokenParser();
    const result = parser.parse(data, 1);

    assert.isTrue(result.done);
    assert.isDefined(result.value);

    const token = result.value!;

    assert.strictEqual(token.type, 'PACKET_SIZE');
    assert.strictEqual(token.oldValue, 1024);
    assert.strictEqual(token.newValue, 2048);
  });
  it('can parse collation change tokens', function() {
    const oldCollation = Buffer.from([ 0x11, 0x04, 0x34, 0x30, 0x00 ]);
    const newCollation = Buffer.from([ 0x11, 0x04, 0x04, 0x20, 0x00 ]);
    const data = buildToken(newCollation, oldCollation, 7);
    const parser = new EnvChangeTokenParser();
    const result = parser.parse(data, 1);

    assert.isTrue(result.done);
    assert.isDefined(result.value);

    const token = result.value!;

    assert.strictEqual(token.type, 'SQL_COLLATION');
    assert.instanceOf(token.oldValue, Collation);
    assert.deepEqual(token.oldValue instanceof Collation ? token.oldValue.toBuffer() : undefined, oldCollation);
    assert.instanceOf(token.newValue, Collation);
    assert.deepEqual(token.newValue instanceof Collation ? token.newValue.toBuffer() : undefined, newCollation);
  });
  it('can parse begin transaction change tokens', function() {
    const newValue = Buffer.from([ 0x04, 0x05, 0x06]);
    const data = buildToken(newValue, Buffer.alloc(0), 8);
    const parser = new EnvChangeTokenParser();
    const result = parser.parse(data, 1);

    assert.isTrue(result.done);
    assert.isDefined(result.value);

    const token = result.value!;

    assert.strictEqual(token.type, 'BEGIN_TXN');
    assert.deepEqual(token.oldValue, Buffer.alloc(0));
    assert.deepEqual(token.newValue, newValue);
  });
  it('can parse commit transaction change tokens', function() {
    const oldValue = Buffer.from([ 0x01, 0x02, 0x03]);
    const data = buildToken(Buffer.alloc(0), oldValue, 9);
    const parser = new EnvChangeTokenParser();
    const result = parser.parse(data, 1);

    assert.isTrue(result.done);
    assert.isDefined(result.value);

    const token = result.value!;

    assert.strictEqual(token.type, 'COMMIT_TXN');
    assert.deepEqual(token.oldValue, oldValue);
    assert.deepEqual(token.newValue, Buffer.alloc(0));
  });
  it('can parse rollback transaction change tokens', function() {
    const oldValue = Buffer.from([ 0x01, 0x02, 0x03]);
    const data = buildToken(Buffer.alloc(0), oldValue, 10);
    const parser = new EnvChangeTokenParser();
    const result = parser.parse(data, 1);

    assert.isTrue(result.done);
    assert.isDefined(result.value);

    const token = result.value!;

    assert.strictEqual(token.type, 'ROLLBACK_TXN');
    assert.deepEqual(token.oldValue, oldValue);
    assert.deepEqual(token.newValue, Buffer.alloc(0));
  });
  it('can parse database mirroring partner change tokens', function() {
    const newMDb = 'NewDataBase';
    const data = buildToken(newMDb, Buffer.alloc(0).toString(), 13);
    const parser = new EnvChangeTokenParser();
    const result = parser.parse(data, 1);

    assert.isTrue(result.done);
    assert.isDefined(result.value);

    const token = result.value!;

    assert.strictEqual(token.type, 'DATABASE_MIRRORING_PARTNER');
    assert.deepEqual(token.oldValue, Buffer.alloc(0).toString());
    assert.deepEqual(token.newValue, newMDb);
  });
  it('can parse reset connection change tokens', function() {
    const data = buildToken(Buffer.alloc(0), Buffer.alloc(0), 18);
    const parser = new EnvChangeTokenParser();
    const result = parser.parse(data, 1);

    assert.isTrue(result.done);
    assert.isDefined(result.value);

    const token = result.value!;

    assert.strictEqual(token.type, 'RESET_CONNECTION');
    assert.deepEqual(token.oldValue, Buffer.alloc(0));
    assert.deepEqual(token.newValue, Buffer.alloc(0));
  });
  it('can parse routing change tokens', function() {
    const valueBuffer = new WritableTrackingBuffer(0);
    valueBuffer.writeUInt8(0); // Protocol
    valueBuffer.writeUInt16LE(60130); // Port
    valueBuffer.writeUsVarchar('127.0.0.1', 'ucs2');

    const envValueDataBuffer = new WritableTrackingBuffer(0);
    envValueDataBuffer.writeUInt8(20); // Type
    envValueDataBuffer.writeUsVarbyte(valueBuffer.data);
    envValueDataBuffer.writeUsVarbyte(Buffer.alloc(0));

    const envChangeBuffer = new WritableTrackingBuffer(0);
    envChangeBuffer.writeUInt8(0xE3); // TokenType
    envChangeBuffer.writeUsVarbyte(envValueDataBuffer.data); // Length + EnvValueData

    const data = envChangeBuffer.data;
    const parser = new EnvChangeTokenParser();
    const result = parser.parse(data, 1);

    assert.isTrue(result.done);
    assert.isDefined(result.value);

    const token = result.value!;
    assert.strictEqual(token.type, 'ROUTING_CHANGE');
    assert.deepEqual(token.oldValue, Buffer.alloc(0));
    assert.deepEqual(token.newValue, {
      protocol: 0,
      port: 60130,
      server: '127.0.0.1'
    });
  });
});
