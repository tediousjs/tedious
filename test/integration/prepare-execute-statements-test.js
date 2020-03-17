const Connection = require('../../src/connection');
const Request = require('../../src/request');
const fs = require('fs');
const TYPES = require('../../src/data-type').typeByName;
const assert = require('chai').assert;

function getConfig() {
  const config = JSON.parse(
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
}

describe('Prepare Execute Statement', function() {
  it('should prepare execute', function(done) {
    const value = 8;

    const config = getConfig();

    const request = new Request('select @param', function(err) {
      assert.ifError(err);
      connection.close();
    });
    request.addParameter('param', TYPES.Int);

    const connection = new Connection(config);

    request.on('prepared', function() {
      assert.ok(request.handle);
      connection.execute(request, { param: value });
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns.length, 1);
      assert.strictEqual(columns[0].value, value);
    });

    connection.on('connect', function(err) {
      assert.ifError(err);
      connection.prepare(request);
    });

    connection.on('end', function(info) {
      done();
    });

    connection.on('debug', function(text) {
      // console.log(text)
    });
  });

  it('should test unprepare', function(done) {
    const config = getConfig();
    const request = new Request('select 3', function(err) {
      assert.ifError(err);
      connection.close();
    });

    const connection = new Connection(config);

    request.on('prepared', function() {
      assert.ok(request.handle);
      connection.unprepare(request);
    });

    connection.on('connect', function(err) {
      assert.ifError(err);
      connection.prepare(request);
    });

    connection.on('end', function(info) {
      done();
    });

    connection.on('debug', function(text) {
      // console.log(text)
    });
  });
});
