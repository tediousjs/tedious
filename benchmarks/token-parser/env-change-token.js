var tedious = require("../../lib/tedious");
var Request = tedious.Request;
var TYPES = tedious.TYPES;

var Parser = require("../../lib/token/token-stream-parser").Parser;

var common = require("../common");

var parser = new Parser({ token: function() { } }, {}, {});

var tokenCount = 500;
var data = new Buffer(new Array(tokenCount).join("e3130004043200300034003800043100300032003400"), "hex");

common.createBenchmark({
  name: "parsing `ENVCHANGE` tokens",

  profileIterations: 1000,

  setup: function(cb) {
    cb();
  },

  exec: function(cb) {
    var count = 0;

    parser.on("packetSizeChange", function() {
      count += 1;

      if (count === tokenCount - 1) {
        parser.removeAllListeners("packetSizeChange");

        cb();
      }
    });

    parser.addBuffer(data);
  },

  teardown: function(cb) {
    cb();
  }
});
