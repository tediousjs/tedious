const assert = require('chai').assert;
const Packet = require('../../src/packet').Packet;
const TYPE = require('../../src/packet').TYPE;
const isPacketComplete = require('../../src/packet').isPacketComplete;

describe('packet type tests', function() {
  it('should create Empty', function() {
    const packet = new Packet(TYPE.PRELOGIN);

    assert.isOk(packet);
    assert.isOk(
      packet.buffer.equals(Buffer.from([TYPE.PRELOGIN, 0, 0, 8, 0, 0, 1, 0]))
    );
  });

  it('should be last', function() {
    let packet = new Packet(TYPE.PRELOGIN);
    assert.isOk(!packet.isLast());

    packet = new Packet(TYPE.PRELOGIN);
    assert.isOk(!packet.last());
    packet.last(true);
    assert.isOk(packet.last());
  });

  it('should have correct packet id', function() {
    const packet = new Packet(TYPE.PRELOGIN);
    assert.strictEqual(packet.packetId(), 1);

    packet.packetId(2);
    assert.strictEqual(packet.packetId(), 2);
  });

  it('should add data', function() {
    const data1 = Buffer.from([0x01, 0x02, 0x03]);
    const data2 = Buffer.from([0xff, 0xfe]);
    const allData = Buffer.concat([data1, data2]);

    const packet = new Packet(TYPE.PRELOGIN);
    assert.strictEqual(packet.length(), 8);
    assert.isOk(packet.data().equals(Buffer.alloc(0)));

    packet.addData(data1);
    assert.strictEqual(packet.length(), 8 + data1.length);
    assert.isOk(packet.data().equals(data1));

    packet.addData(data2);
    assert.strictEqual(packet.length(), 8 + allData.length);
    assert.isOk(packet.data().equals(allData));
  });

  it('should create from buffer', function() {
    const buffer = Buffer.from([
      TYPE.PRELOGIN,
      0x01,
      0x00,
      0x0a,
      0,
      0,
      0,
      0,
      0x01,
      0xff
    ]);
    const packet = new Packet(buffer);

    assert.strictEqual(packet.length(), 0x0a);
    assert.isOk(packet.isLast());
    assert.isOk(packet.data().equals(Buffer.from([0x01, 0xff])));
  });

  it('should convert header to string', function() {
    const buffer = Buffer.from([
      TYPE.PRELOGIN,
      0x03,
      0x00,
      0x0a,
      0,
      1,
      2,
      3,
      0x01,
      0xff
    ]);
    const packet = new Packet(buffer);

    const expectedText =
      '--type:0x12(PRELOGIN), status:0x03(EOM IGNORE), length:0x000A, spid:0x0001, packetId:0x02, window:0x03';
    assert.strictEqual(packet.headerToString('--'), expectedText);
  });

  it('should convert data to string short', function() {
    const data = Buffer.from([0x01, 0x02, 0x03]);

    const packet = new Packet(TYPE.PRELOGIN);
    packet.addData(data);

    const expectedText = '--0000  010203  ...';
    assert.strictEqual(packet.dataToString('--'), expectedText);
  });

  it('should data with exact lines worth', function() {
    const dataLine1a = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    const dataLine1b = Buffer.from([0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
    const dataLine2a = Buffer.from([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17]);
    const dataLine2b = Buffer.from([0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f]);

    const packet = new Packet(TYPE.PRELOGIN);
    packet.addData(dataLine1a);
    packet.addData(dataLine1b);
    packet.addData(dataLine2a);
    packet.addData(dataLine2b);

    const expectedTextLine1a = '--0000  00010203 04050607 08090A0B 0C0D0E0F';
    const expectedTextLine1b = ' 10111213 14151617 18191A1B 1C1D1E1F';
    const expectedTextLine1c = '  ........ ........ ........ ........';
    const expectedText =
      expectedTextLine1a + expectedTextLine1b + expectedTextLine1c;
    assert.strictEqual(packet.dataToString('--'), expectedText);
  });

  it('should convert data to strings in mulitple lines', function() {
    const dataLine1a = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    const dataLine1b = Buffer.from([0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
    const dataLine2a = Buffer.from([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17]);
    const dataLine2b = Buffer.from([0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f]);
    const dataLine3a = Buffer.from([0x30, 0x31, 0x32]);

    const packet = new Packet(TYPE.PRELOGIN);
    packet.addData(dataLine1a);
    packet.addData(dataLine1b);
    packet.addData(dataLine2a);
    packet.addData(dataLine2b);
    packet.addData(dataLine3a);

    const expectedTextLine1a = '--0000  00010203 04050607 08090A0B 0C0D0E0F';
    const expectedTextLine1b = ' 10111213 14151617 18191A1B 1C1D1E1F';
    const expectedTextLine1c = '  ........ ........ ........ ........\n';
    const expectedTextLine2a = '--0020  303132';
    const expectedTextLine2b = '  012';
    const expectedText =
      expectedTextLine1a +
      expectedTextLine1b +
      expectedTextLine1c +
      expectedTextLine2a +
      expectedTextLine2b;
    assert.strictEqual(packet.dataToString('--'), expectedText);
  });

  it('should packet complete shorter than header', function() {
    const buffer = Buffer.alloc(7);
    assert.isOk(!isPacketComplete(buffer));
  });

  it('should packet complete with just header', function() {
    const buffer = new Packet(TYPE.PRELOGIN).buffer;

    assert.isOk(isPacketComplete(buffer));
  });

  it('should not packet complete too short', function() {
    const buffer = Buffer.from([
      0x00,
      0x00,
      0x00,
      0x0c,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00
    ]);

    assert.isOk(!isPacketComplete(buffer));
  });

  it('should packet complete long enough', function() {
    const buffer = Buffer.from([
      0x00,
      0x00,
      0x00,
      0x0c,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00
    ]);

    assert.isOk(isPacketComplete(buffer));
  });
});
