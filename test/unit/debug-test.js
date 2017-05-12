var Debug = require('../../src/debug');

var payload = 'payload';

class Packet {
  headerToString() {
    return 'header';
  }

  dataToString() {
    return 'data';
  }
}

exports.packet = function(test) {
  var emitCount = 0;

  var debug = new Debug({ packet: true });

  debug.on('debug', function(text) {
    emitCount++;

    switch (emitCount) {
      case 2:
        test.ok(/dir/.test(text));
        break;
      case 3:
        test.ok(/header/.test(text));
        test.done();
        break;
    }
  });

  return debug.packet('dir', new Packet());
};

exports.payloadEnabled = function(test) {
  var debug = new Debug({ payload: true });
  debug.on('debug', function(text) {
    test.strictEqual(text, payload);

    test.done();
  });

  return debug.payload(function() {
    return payload;
  });
};

exports.payloadNotEnabled = function(test) {
  var debug = new Debug();
  debug.on('debug', function(text) {
    test.ok(false);
  });

  debug.payload(payload);

  test.done();
};

exports.dataEnable = function(test) {
  var debug = new Debug({ data: true });
  debug.on('debug', function(text) {
    test.strictEqual(text, 'data');

    test.done();
  });

  return debug.data(new Packet());
};

exports.dataNotEnabled = function(test) {
  var debug = new Debug();
  debug.on('debug', function(text) {
    test.ok(false);
  });

  debug.data(new Packet());

  test.done();
};

exports.tokenEnabled = function(test) {
  var debug = new Debug({ token: true });
  debug.on('debug', function(token) {
    test.ok(token.indexOf('test') !== 0);

    test.done();
  });

  return debug.token({ name: 'test' });
};

exports.payloadNotEnabledTest = function(test) {
  var debug = new Debug();
  debug.on('debug', function(token) {
    test.ok(false);
  });

  debug.token({ name: 'test' });

  test.done();
};
