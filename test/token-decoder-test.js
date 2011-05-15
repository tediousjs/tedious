var TokenDecoder = require('../src/token-decoder').TokenDecoder;

exports.unknownToken = function(test) {
  var decoder = new TokenDecoder();
  
  test.expect(2);

  decoder.on('unknown', function() {
    test.ok(true);
  });
  
  decoder.on('done', function() {
    test.ok(true);

    test.done();
  });
  
  decoder.decode([0x00]);
};

exports.multipleTokens = function(test) {
  var decoder = new TokenDecoder();
  
  test.expect(3);

  decoder.on('loginAck', function() {
    test.ok(true);
  });
  
  decoder.on('done', function() {
    test.ok(true);

    test.done();
  });
  
  decoder.decode([0xAD, 0x0a, 0x00, 123, 0x44, 0x33, 0x22, 0x11, 0x00, 0x01, 0x02, 0x03, 0x04,
                  0xAD, 0x0a, 0x00, 123, 0x44, 0x33, 0x22, 0x11, 0x00, 0x01, 0x02, 0x03, 0x04]);
};

exports.loginAck = function(test) {
  var decoder = new TokenDecoder();
  
  test.expect(7);

  decoder.on('loginAck', function(loginAck) {
    test.strictEqual(loginAck.interfaceType, 123);
    test.strictEqual(loginAck.tdsVersion, 0x11223344);
    test.strictEqual(loginAck.progName, 'abc');
    test.strictEqual(loginAck.progVersion.major, 0x01);
    test.strictEqual(loginAck.progVersion.minor, 0x02);
    test.strictEqual(loginAck.progVersion.buildNumberHigh, 0x03);
    test.strictEqual(loginAck.progVersion.buildNumberLow, 0x04);
  });
  
  decoder.on('done', function() {
    test.done();
  });
  
  decoder.decode([0xAD, 0x10, 0x00, 123, 0x44, 0x33, 0x22, 0x11,
                  0x03, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00,
                  0x01, 0x02, 0x03, 0x04]);
};
