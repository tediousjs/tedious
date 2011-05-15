var TokenDecoder = require('../src/token-decoder').TokenDecoder;

exports.unknownToken = function(test) {
  var decoder = new TokenDecoder();
  
  test.expect(2);

  decoder.on('unknown', function() {
    test.ok(true);
  });
  
  decoder.on('end', function() {
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
  
  decoder.on('end', function() {
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
  
  decoder.on('end', function() {
    test.done();
  });
  
  decoder.decode([0xAD, 0x10, 0x00, 123, 0x44, 0x33, 0x22, 0x11,
                  0x03, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00,
                  0x01, 0x02, 0x03, 0x04]);
};

exports.envChangeBVarchar = function(test) {
  var decoder = new TokenDecoder();
  
  test.expect(3);

  decoder.on('envChange', function(envChange) {
    test.strictEqual(envChange.type, 'database');
    test.strictEqual(envChange.newValue, 'ab');
    test.strictEqual(envChange.oldValue, 'ac');
  });
  
  decoder.on('end', function() {
    test.done();
  });
  
  decoder.decode([0xe3, 0x0b, 0x00,
                  0x01,
                  0x02, 0x61, 0x00, 0x62, 0x00,
                  0x02, 0x61, 0x00, 0x63, 0x00]);
};

exports.envChangeBVarbyte = function(test) {
  var decoder = new TokenDecoder();
  
  test.expect(3);

  decoder.on('envChange', function(envChange) {
    test.strictEqual(envChange.type, 'sqlCollation');
    test.deepEqual(envChange.newValue, [1, 2]);
    test.deepEqual(envChange.oldValue, [3, 4, 5]);
  });
  
  decoder.on('end', function() {
    test.done();
  });
  
  decoder.decode([0xe3, 0x08, 0x00,
                  0x07,
                  0x02, 0x01, 0x02,
                  0x03, 0x03, 0x04, 0x05]);
};

exports.info = function(test) {
  var decoder = new TokenDecoder();
  
  test.expect(7);

  decoder.on('info', function(info) {
    test.strictEqual(info.number, 0x1234);
    test.strictEqual(info.state, 0x01);
    test.strictEqual(info.class, 0x02);
    test.strictEqual(info.messageText, 'abc');
    test.strictEqual(info.serverName, 'ab');
    test.strictEqual(info.procName, 'ac');
    test.strictEqual(info.lineNumber, 3);
  });
  
  decoder.on('end', function() {
    test.done();
  });
  
  decoder.decode([0xab, 0x1c, 0x00,
                  0x34, 0x12, 0x00, 0x00,
                  0x01,
                  0x02,
                  0x03, 0x00, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00,
                  0x02, 0x61, 0x00, 0x62, 0x00,
                  0x02, 0x61, 0x00, 0x63, 0x00,
                  0x03, 0x00, 0x00, 0x00
                  ]);
};

exports.error = function(test) {
  var decoder = new TokenDecoder();
  
  test.expect(7);

  decoder.on('error_', function(info) {
    test.strictEqual(info.number, 0x1234);
    test.strictEqual(info.state, 0x01);
    test.strictEqual(info.class, 0x02);
    test.strictEqual(info.messageText, 'abc');
    test.strictEqual(info.serverName, 'ab');
    test.strictEqual(info.procName, 'ac');
    test.strictEqual(info.lineNumber, 3);
  });
  
  decoder.on('end', function() {
    test.done();
  });
  
  decoder.decode([0xaa, 0x1c, 0x00,
                  0x34, 0x12, 0x00, 0x00,
                  0x01,
                  0x02,
                  0x03, 0x00, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00,
                  0x02, 0x61, 0x00, 0x62, 0x00,
                  0x02, 0x61, 0x00, 0x63, 0x00,
                  0x03, 0x00, 0x00, 0x00
                  ]);
};

exports.done = function(test) {
  var decoder = new TokenDecoder();
  
  test.expect(3);

  decoder.on('done', function(done) {
    test.strictEqual(done.status, 'DONE_FINAL');
    test.strictEqual(done.currentCommandToken, 2);
    test.strictEqual(done.rowCount, 3);
  });
  
  decoder.on('end', function() {
    test.done();
  });
  
  decoder.decode([0xfd,
                  0x00, 0x00,
                  0x02, 0x00,
                  0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
};
