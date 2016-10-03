'use strict';

var Connection, Request, TYPES, fs, getConfig;

Connection = require('../../src/connection');

Request = require('../../src/request');

fs = require('fs');

TYPES = require('../../src/data-type').typeByName;

getConfig = function() {
  var config;
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config;
  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: false,
    log: true
  };
  return config;
};

exports.prepareExecute = function(test) {
  var config, connection, request, value;
  test.expect(5);
  value = 8;
  config = getConfig();
  request = new Request('select @param', function(err) {
    test.ifError(err);
    return connection.close();
  });
  request.addParameter('param', TYPES.Int);
  connection = new Connection(config);
  request.on('prepared', function() {
    test.ok(request.handle);
    return connection.execute(request, {
      param: value
    });
  });
  request.on('row', function(columns) {
    test.strictEqual(columns.length, 1);
    return test.strictEqual(columns[0].value, value);
  });
  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.prepare(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  return connection.on('debug', function(text) {});
};

exports.unprepare = function(test) {
  var config, connection, request;
  test.expect(3);
  config = getConfig();
  request = new Request('select 3', function(err) {
    test.ifError(err);
    return connection.close();
  });
  connection = new Connection(config);
  request.on('prepared', function() {
    test.ok(request.handle);
    return connection.unprepare(request);
  });
  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.prepare(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  return connection.on('debug', function(text) {});
};
