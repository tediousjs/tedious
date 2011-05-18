var Packet = require('../../src/packet').Packet,
    toArray = require('../../src/buffer-util').toArray;

exports.PacketFromBuffer = function(test){
  var type = 0x12,
      packet = new Packet(new Buffer([type, 0x01, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x55, 0xff])),
      buffer = packet.buffer;

  test.equal(buffer.length, 10, 'length');
  
  test.done();
};

exports.BuildPacketLast = function(test){
  var data = [0x55, 0xff],
      type = 0x12,
      packet = new Packet(type, data, {last: true}),
      buffer = packet.buffer;

  test.equal(buffer.length, 10, 'length');

  test.deepEqual(toArray(buffer.slice(0, 8)), [type, 0x01, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00], 'header');
  test.deepEqual(toArray(buffer.slice(8)), data, 'data');
  
  test.done();
};

exports.BuildPacketNonLast = function(test){
  var data = [0x55, 0xff],
      type = 0x12,
      packet = new Packet(type, data),
      buffer = packet.buffer;

  test.equal(buffer.length, 10, 'length');

  test.deepEqual(toArray(buffer.slice(0, 8)), [type, 0x00, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00], 'header');
  test.deepEqual(toArray(buffer.slice(8)), data, 'data');
  
  test.done();
};

exports.DecodePacket = function(test){
  var data = [0x55, 0xff],
      type = 0x12,
      packet = new Packet(type, data, {last: true}),
      decoded = packet.decode();
  
  test.equal(decoded.header.type, 0x12, 'type');
  test.equal(decoded.header.status, 0x01, 'status');
  test.equal(decoded.header.length, 0x000a, 'length');
  test.equal(decoded.header.spid, 0x0000, 'spid');
  test.equal(decoded.header.packetId, 0x00, 'packetId');
  test.equal(decoded.header.window, 0x00, 'window');
  
  test.deepEqual(toArray(decoded.data), data, 'data');
  test.done();
};

exports.ToString = function(test) {
  var data = [0x55, 0xff],
      type = 0x12,
      packet = new Packet(type, data, {last: true});

  test.ok(packet.headerToString().indexOf('PRELOGIN') !== -1);
  test.ok(packet.dataDump().indexOf('0000  55FF') !== -1);
  
  test.done();
};
