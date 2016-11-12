'use strict';

const Connection = require('../../src/connection');
const Request = require('../../src/request');
const fs = require('fs');
const TYPES = require('../../src/data-type').typeByName;

const config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config;

config.options.debug = {
  packet: true,
  data: true,
  payload: true,
  token: true,
  log: true
};

config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

exports.insertBinary = function(test) {
  const connection = new Connection(config);
  connection.on('end', function() {
    test.done();
  });

  connection.on('connect', function(err) {
    test.ifError(err);

    const request = new Request('CREATE TABLE #test ([data] binary(4))', function(err) {
      test.ifError(err);

      const request = new Request('INSERT INTO #test ([data]) VALUES (@p1)', function(err) {
        test.ifError(err);

        const request = new Request('SELECT [data] FROM #test', function(err) {
          test.ifError(err);
          connection.close();
        });

        request.on('row', function(columns) {
          test.strictEqual(columns[0].value.toString('hex'), new Buffer([0x12, 0x34, 0x00, 0xce]).toString('hex'));
        });

        connection.execSql(request);
      });

      request.addParameter('p1', TYPES.Binary, new Buffer([0x12, 0x34, 0x00, 0xce]));
      connection.execSql(request);
    });

    connection.execSqlBatch(request);
  });
};
