var
  buildPacket = require('../src/packet').build,
  packetType = require('../src/packet').type;

exports.Packet = function(test){
  var packet = buildPacket(packetType.PRELOGIN, [0x55, 0xff]);
  var content = packet.content();

  test.equal(content.length, 10, 'length');

  test.deepEqual(content.slice(0, 8), [0x12, 0x01, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00], 'header');
  test.deepEqual(content.slice(8), [0x55, 0xff], 'data');
  
  test.done();
};

exports.PacketNonLast = function(test){
  var packet = buildPacket(packetType.PRELOGIN, [], {last: false});
  var content = packet.content();

  test.equal(content.length, 8, 'length');

  test.deepEqual(content.slice(0, 8), [0x12, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00], 'header');
  test.deepEqual(content.slice(8), [], 'data');
  
  test.done();
};
