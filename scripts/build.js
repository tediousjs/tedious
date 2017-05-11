var fs = require('fs');
var path = require('path');
var child = require('child_process');

var rmdir = function(dir) {
  var list = fs.readdirSync(dir);
  for (var entry of list) {
    remove(dir, entry);
  }

  return fs.rmdirSync(dir);
};

var remove = function(dir, entry) {
  var filename = path.join(dir, entry);
  var stat = fs.statSync(filename);
  if (entry === '.' || entry === '..') {
    //
  } else if (stat.isDirectory()) {
    return rmdir(filename);
  } else {
    return fs.unlinkSync(filename);
  }
};

var isdir = function(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch (error) {
    return false;
  }
};

if (isdir('src')) {
  if (isdir('lib')) {
    rmdir('lib');
  }

  var babel_bin = path.join('node_modules', '.bin', 'babel');

  child.exec(`${babel_bin} src --out-dir lib`, function(err) {
    if (err) {
      return console.error(err);
    }
  });
}
