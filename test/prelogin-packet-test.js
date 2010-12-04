var
  buildPacket = require('../src/prelogin-packet').build;

exports.PreloginPacket = function(test){
  var packet = buildPacket();

  test.equal(packet.length, 47, 'packet length');

  test.deepEqual(
      packet.slice(8),
      [
        0x00, 0x00, 26, 0x00, 0x06,             // version option
        0x01, 0x00, 32, 0x00, 0x01,             // encryption option
        0x02, 0x00, 33, 0x00, 0x01,             // instance option
        0x03, 0x00, 34, 0x00, 0x04,             // thread id option
        0x04, 0x00, 38, 0x00, 0x01,             // mars option
        0xFF,                                   // terminator option
        
        0x00, 0x00, 0x00, 0x01, 0x00, 0x01,     // version
        0x02,                                   // encryption
        0x00,                                   // instance
        0x00, 0x00, 0x00, 0x00,                 // thread id
        0x00                                    // mars
       ],
      'content (excluding header)');

  test.done();
};
