"use strict";

var fs = require("fs");
var async = require("async");
var Benchmark = require("benchmark");
var Connection = require("../lib/tedious").Connection;

function createConnection(cb) {
  var config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config;

  var connection = new Connection(config);
  connection.on("connect", function() {
    cb(connection);
  });
}

function createBenchmark(test) {
  if (process.argv.indexOf("--profile") != -1) {
    process.nextTick(function() {
      runProfile(test);
    });
  } else {
    process.nextTick(function() {
      runBenchmark(test);
    });
  }
}

function runBenchmark(test) {
  var memStart, memMax = memStart = process.memoryUsage().rss;

  test.setup(function(err) {
    if (err) throw err;

    var bm = new Benchmark(test.name, {
      defer: true,
      fn: function(deferred) {
        test.exec(function(err) {
          if (err) throw err;

          memMax = Math.max(memMax, process.memoryUsage().rss);

          deferred.resolve();
        });
      }
    });

    bm.on("complete", function(event) {
      console.log(String(event.target))
      console.log("Memory:", (memMax - memStart)/1024/1024, "MiB")

      test.teardown(function(err) {
        if (err) throw err;
      });
    });

    bm.run({ "async": true });
  });
}

function runProfile(test) {
  test.setup(function(err) {
    if (err) throw err;

    async.timesSeries(test.profileIterations, function(n, done) {
      async.setImmediate(function() {
        console.log("[Iteration " +  n + "]");
        test.exec(done);
      });
    }, function(err) {
      if (err) throw err;

      test.teardown(function(err) {
        if (err) throw err;
      });
    });
  });
}

module.exports.createBenchmark = createBenchmark;
module.exports.createConnection = createConnection;

