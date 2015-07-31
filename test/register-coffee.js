"use strict";

// Are we running on iojs?
if (parseInt(process.version.match(/^v(\d+)\./)[1]) >= 1) {
  require('coffee-script/register');
} else {
  var CoffeeScript = require('coffee-script');
  var babel = require("babel");

  require.extensions[".coffee"] = function(module, filename) {
    var answer = CoffeeScript._compileFile(filename, false);
    var result = babel.transform(answer, {
      filename: filename,
      sourceMap: "both",
      ast:       false
    });

    return module._compile(result.code, filename);
  };
}
