var
  RpcRequestPacket = require('../../src/rpc-request-packet').RpcRequestPacket,
  toArray = require('../../src/buffer-util').toArray;

exports.RpcRequestPacket = function(test){
  var packet = new RpcRequestPacket(),
      buffer = packet.buffer;

  //console.log(buffer);
  test.equal(buffer.length, 48, 'packet length');

  test.done();
};
