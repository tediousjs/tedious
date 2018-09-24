var tedious = require("../../lib/tedious");
var Request = tedious.Request;
var TYPES = tedious.TYPES;

var Parser = require("../../lib/token/token-stream-parser").Parser;

var common = require("../common");

var parser = new Parser({ token: function() { } }, {}, {});

var tokenCount = 500;
var data = Buffer.from(new Array(tokenCount).join("FE0000E0000000000000000000"), "hex");

common.createBenchmark({
  name: "parsing `DONEPROC` tokens",

  profileIterations: 3000,

  setup: function(cb) {
    cb();
  },

  exec: function(cb) {
    var count = 0;

    parser.on("doneProc", function() {
      count += 1;

      if (count === tokenCount - 1) {
        parser.removeAllListeners("doneProc");

        cb();
      }
    });

    parser.addBuffer(data);
  },

  teardown: function(cb) {
    cb();
  }
});
