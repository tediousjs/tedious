var Debug = require('../../../src/debug');
var Parser = require('../../../src/token/token-stream-parser').Parser;
var TYPE = require('../../../src/token/token').TYPE;
var WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer')
  .WritableTrackingBuffer;

var debug = new Debug({ token: true });

module.exports.envChange = function(test) {
  test.expect(2);

  var buffer = createDbChangeBuffer();

  var parser = new Parser(debug);
  parser.on('databaseChange', function(event) {
    return test.ok(event);
  });

  parser.addBuffer(buffer);

  test.ok(parser.isEnd());

  return test.done();
};

module.exports.tokenSplitAcrossBuffers = function(test) {
  test.expect(2);

  var buffer = createDbChangeBuffer();

  var parser = new Parser(debug);
  parser.on('databaseChange', function(event) {
    return test.ok(event);
  });

  parser.addBuffer(buffer.slice(0, 6));
  parser.addBuffer(buffer.slice(6));

  test.ok(parser.isEnd());

  return test.done();
};

var createDbChangeBuffer = function() {
  var oldDb = 'old';
  var newDb = 'new';
  var buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(TYPE.ENVCHANGE);
  buffer.writeUInt16LE(0); // Length written later
  buffer.writeUInt8(0x01); // Database
  buffer.writeUInt8(newDb.length);
  buffer.writeString(newDb);
  buffer.writeUInt8(oldDb.length);
  buffer.writeString(oldDb);

  buffer.data.writeUInt16LE(buffer.data.length - (1 + 2), 1);
  //console.log(buffer)

  return buffer.data;
};
