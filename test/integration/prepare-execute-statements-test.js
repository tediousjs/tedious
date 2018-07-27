var Connection = require('../../src/connection');
var Request = require('../../src/request');
var fs = require('fs');
var TYPES = require('../../src/data-type').typeByName;

/* eslint-disable no-unused-vars */

var getConfig = function() {
  var config = JSON.parse(
    fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
  ).config;

  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: false,
    log: true,
  };

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

  return config;
};

exports.prepareExecute = function(test) {
  test.expect(5);
  var value = 8;

  var config = getConfig();

  var request = new Request('select @param', function(err) {
    test.ifError(err);
    connection.close();
  });
  request.addParameter('param', TYPES.Int);

  var connection = new Connection(config);

  request.on('prepared', function() {
    test.ok(request.handle);
    connection.execute(request, {param: value});
  });

  request.on('row', function(columns) {
    test.strictEqual(columns.length, 1);
    test.strictEqual(columns[0].value, value);
  });

  connection.on('connect', function(err) {
    test.ifError(err);
    connection.prepare(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.unprepare = function(test) {
  test.expect(3);

  var config = getConfig();
  var prepared = false;

  var request = new Request('select 3', function(err) {
    test.ifError(err);
    connection.close();
  });

  var connection = new Connection(config);

  request.on('prepared', function() {
    test.ok(request.handle);
    connection.unprepare(request);
  });

  connection.on('connect', function(err) {
    test.ifError(err);
    connection.prepare(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};
