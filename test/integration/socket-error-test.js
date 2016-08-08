'use strict';

const Connection = require('../../src/connection');
const Request = require('../../src/request');
const fs = require('fs');

function getConfig() {
  const config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config;

  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: false,
    log: true
  };

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

  return config;
}

exports.socketError = function(test) {
  const connection = new Connection(getConfig());

  test.expect(3);

  connection.on('connect', function(err) {
    test.ifError(err);

    const request = new Request('WAITFOR 00:00:30', function(err) {
      test.ok(~err.message.indexOf('socket error'));
    });

    connection.execSql(request);
    connection.socket.emit('error', new Error('socket error'));
  });

  connection.on('end', function() {
    test.done();
  });

  connection.on('error', function(err) {
    test.ok(~err.message.indexOf('socket error'));
  });
};
