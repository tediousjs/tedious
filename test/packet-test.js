var
  buildPacket = require('../src/packet').build,
  parsePacket = require('../src/packet').parse,
  packetType = require('../src/packet').type;

exports.BuildPacket = function(test){
  var packet = buildPacket(packetType.PRELOGIN, [0x55, 0xff]);
  var content = packet.content();

  test.equal(content.length, 10, 'length');

  test.deepEqual(content.slice(0, 8), [0x12, 0x01, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00], 'header');
  test.deepEqual(content.slice(8), [0x55, 0xff], 'data');
  
  test.done();
};

exports.BuildPacketNonLast = function(test){
  var packet = buildPacket(packetType.PRELOGIN, [], {last: false});
  var content = packet.content();

  test.equal(content.length, 8, 'length');

  test.deepEqual(content.slice(0, 8), [0x12, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00], 'header');
  test.deepEqual(content.slice(8), [], 'data');
  
  test.done();
};

exports.ParsePacket = function(test){
  test.expect(7);
  
  var packetContent = [0x12, 0x01, 0x00, 0x0a, 0x12, 0x34, 0x01, 0x02, 0x55, 0xff];
  var packet = parsePacket(packetContent, function(header, data) {
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
