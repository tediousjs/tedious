var fs = require("fs");
var path = require("path");
var childProcess = require("child_process")
var Benchmark = require("benchmark");

var Connection = require("../lib/tedious").Connection;
var Request = require("../lib/tedious").Request;

var types = ["query", "token-parser"];
var tests = [];

types.forEach(function(type) {
  var dir = path.join(__dirname, type);
  tests.push.apply(tests, fs.readdirSync(dir).map(function(file) {
    return path.join(dir, file);
  }));
});

runBenchmarks();

function runBenchmarks() {
  var test = tests.shift();
  if (!test)
    return;

  var child = childProcess.spawn(process.execPath, [ test ], { stdio: 'inherit' });
  child.on('close', function(code) {
    if (code) {
      process.exit(code);
    } else {
      runBenchmarks();
    }
  });
}
