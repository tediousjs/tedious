var
  buildPacket = require('../src/packet').build,
  decodePacket = require('../src/packet').decode,
  packetType = require('../src/packet').type;

exports.BuildPacket = function(test){
  var packet = buildPacket(packetType.PRELOGIN, [0x55, 0xff], {});

  test.equal(packet.length, 10, 'length');

  test.deepEqual(packet.slice(0, 8), [0x12, 0x01, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00], 'header');
  test.deepEqual(packet.slice(8), [0x55, 0xff], 'data');
  
  test.done();
};

exports.BuildPacketNonLast = function(test){
  var packet = buildPacket(packetType.PRELOGIN, [], {last: false});

  test.equal(packet.length, 8, 'length');

  test.deepEqual(packet.slice(0, 8), [0x12, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00], 'header');
  test.deepEqual(packet.slice(8), [], 'data');
  
  test.done();
};

exports.DecodePacket = function(test){
  test.expect(7);
  
  var packetContent = [0x12, 0x01, 0x00, 0x0a, 0x12, 0x34, 0x01, 0x02, 0x55, 0xff];
  var packet = decodePacket(packetContent, function(header, data) {
    test.equal(header.type, 0x12, 'type');
    test.equal(header.status, 0x01, 'status');
    test.equal(header.length, 0x000a, 'length');
    test.equal(header.spid, 0x1234, 'spid');
    test.equal(header.packetId, 0x01, 'packetId');
    test.equal(header.window, 0x02, 'window');
    
    test.deepEqual(data, [0x55, 0xff], 'data');
  });
  
  test.done();
};
