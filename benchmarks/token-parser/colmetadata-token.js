var tedious = require("../../lib/tedious");
var Request = tedious.Request;
var TYPES = tedious.TYPES;

var Parser = require("../../lib/token/token-stream-parser").Parser;

var common = require("../common");

var parser = new Parser({ token: function() { } }, {}, {});

var tokenCount = 50;
var data = Buffer.from(new Array(tokenCount).join("810300000000001000380269006400000000000900e7c8000904d00034046e0061006d006500000000000900e7ffff0904d000340b6400650073006300720069007000740069006f006e00"), "hex");

common.createBenchmark({
  name: "parsing `COLMETADATA` tokens",

  profileIterations: 3000,

  setup: function(cb) {
    cb();
  },

  exec: function(cb) {
    var count = 0;

    parser.on("columnMetadata", function() {
      count += 1;

      if (count === tokenCount - 1) {
        parser.removeAllListeners("columnMetadata");

        cb();
      }
    });

    parser.addBuffer(data);
  },

  teardown: function(cb) {
    cb();
  }
});
