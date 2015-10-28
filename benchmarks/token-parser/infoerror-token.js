var tedious = require("../../lib/tedious");
var Request = tedious.Request;
var TYPES = tedious.TYPES;

var Parser = require("../../lib/token/token-stream-parser").Parser;

var common = require("../common");

var parser = new Parser({ token: function() { } }, {}, {});

var tokenCount = 500;
var data = new Buffer(new Array(tokenCount).join('ab300003000000040507006d006500730073006100670065000673006500720076006500720004700072006f00630006000000'), "hex");

common.createBenchmark({
  name: "parsing `INFO` tokens",

  profileIterations: 1000,

  setup: function(cb) {
    cb();
  },

  exec: function(cb) {
    var count = 0;

    parser.on("infoMessage", function() {
      count += 1;

      if (count === tokenCount - 1) {
        parser.removeAllListeners("infoMessage");

        cb();
      }
    });

    parser.addBuffer(data);
  },

  teardown: function(cb) {
    cb();
  }
});
