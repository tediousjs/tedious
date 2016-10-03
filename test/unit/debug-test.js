'use strict';

var Debug, Packet, payload;

Debug = require('../../src/debug');

payload = 'payload';

Packet = (function() {
  function Packet() {}

  Packet.prototype.headerToString = function() {
    return 'header';
  };

  Packet.prototype.dataToString = function() {
    return 'data';
  };

  return Packet;

})();

exports.packet = function(test) {
  var debug, emitCount;
  emitCount = 0;
  debug = new Debug({
    packet: true
  });
  debug.on('debug', function(text) {
    emitCount++;
    switch (emitCount) {
      case 2:
        return test.ok(/dir/.test(text));
      case 3:
        test.ok(/header/.test(text));
        return test.done();
    }
  });
  return debug.packet('dir', new Packet());
};

exports.payloadEnabled = function(test) {
  var debug;
  debug = new Debug({
    payload: true
  });
  debug.on('debug', function(text) {
    test.strictEqual(text, payload);
    return test.done();
  });
  return debug.payload(function() {
    return payload;
  });
};

exports.payloadNotEnabled = function(test) {
  var debug;
  debug = new Debug();
  debug.on('debug', function(text) {
    return test.ok(false);
  });
  debug.payload(payload);
  return test.done();
};

exports.dataEnable = function(test) {
  var debug;
  debug = new Debug({
    data: true
  });
  debug.on('debug', function(text) {
    test.strictEqual(text, 'data');
    return test.done();
  });
  return debug.data(new Packet());
};

exports.dataNotEnabled = function(test) {
  var debug;
  debug = new Debug();
  debug.on('debug', function(text) {
    return test.ok(false);
  });
  debug.data(new Packet());
  return test.done();
};

exports.tokenEnabled = function(test) {
  var debug;
  debug = new Debug({
    token: true
  });
  debug.on('debug', function(token) {
    test.ok(token.indexOf('test') !== 0);
    return test.done();
  });
  return debug.token({
    name: 'test'
  });
};

exports.payloadNotEnabled = function(test) {
  var debug;
  debug = new Debug();
  debug.on('debug', function(token) {
    return test.ok(false);
  });
  debug.token({
    name: 'test'
  });
  return test.done();
};
