'use strict';

var Parser = require('../../lib/token/token-stream-parser').Parser;

var common = require('../common');

var parser = new Parser({ token: function() { } }, {}, {});

var tokenCount = 500;
var data = new Buffer(new Array(tokenCount).join('A90A0000000100020003000400'), 'hex');

common.createBenchmark({
  name: 'parsing `ORDER` tokens',

  profileIterations: 1000,

  setup: function(cb) {
    cb();
  },

  exec: function(cb) {
    var count = 0;

    parser.on('order', function() {
      count += 1;

      if (count === tokenCount - 1) {
        parser.removeAllListeners('order');

        cb();
      }
    });

    parser.addBuffer(data);
  },

  teardown: function(cb) {
    cb();
  }
});
