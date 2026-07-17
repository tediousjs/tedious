import { assert } from 'chai';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { typeByName as TYPES } from '../../src/data-type';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

const config = {
  ...defaultConfig,
  options: {
    ...defaultConfig.options,
    debug: debugOptionsFromEnv(),
    tdsVersion: process.env.TEDIOUS_TDS_VERSION
  }
};

describe('json data type', function() {
  let connection: Connection;

  beforeEach(function(done) {
    connection = new Connection(config);

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect(done);
  });

  afterEach(function(done) {
    if (!connection.closed) {
      connection.on('end', done);
      connection.close();
    } else {
      done();
    }
  });

  describe('on servers that support the json data type', function() {
    beforeEach(function() {
      if (!connection.serverSupportsJson) {
        this.skip();
      }
    });

    it('returns json columns as strings', function(done) {
      const request = new Request('SELECT CAST(\'{"a":[1,"ü"]}\' AS json)', (err) => {
        done(err);
      });

      request.on('row', (columns) => {
        assert.strictEqual(columns[0].metadata.type.name, 'JSON');
        assert.isString(columns[0].value);
        assert.deepEqual(JSON.parse(columns[0].value), { a: [1, 'ü'] });
      });

      connection.execSql(request);
    });

    it('returns null json values as `null`', function(done) {
      const request = new Request('SELECT CAST(NULL AS json)', (err) => {
        done(err);
      });

      request.on('row', (columns) => {
        assert.strictEqual(columns[0].metadata.type.name, 'JSON');
        assert.isNull(columns[0].value);
      });

      connection.execSql(request);
    });

    it('round-trips string parameter values', function(done) {
      const value = '{"a":[1,"ü"],"b":null}';

      const request = new Request('SELECT @p', (err) => {
        done(err);
      });
      request.addParameter('p', TYPES.JSON, value);

      request.on('row', (columns) => {
        assert.deepEqual(JSON.parse(columns[0].value), JSON.parse(value));
      });

      connection.execSql(request);
    });

    it('round-trips object parameter values', function(done) {
      const value = { a: [1, 'ü'], b: null };

      const request = new Request('SELECT @p', (err) => {
        done(err);
      });
      request.addParameter('p', TYPES.JSON, value);

      request.on('row', (columns) => {
        assert.deepEqual(JSON.parse(columns[0].value), value);
      });

      connection.execSql(request);
    });

    it('round-trips `null` parameter values', function(done) {
      const request = new Request('SELECT @p', (err) => {
        done(err);
      });
      request.addParameter('p', TYPES.JSON, null);

      request.on('row', (columns) => {
        assert.isNull(columns[0].value);
      });

      connection.execSql(request);
    });
  });

  describe('on servers that do not support the json data type', function() {
    beforeEach(function() {
      if (connection.serverSupportsJson) {
        this.skip();
      }
    });

    it('fails json parameters with a descriptive error', function(done) {
      const request = new Request('SELECT @p', (err) => {
        assert.instanceOf(err, Error);
        assert.strictEqual((err as any).code, 'EJSONNOTSUPPORTED');
        done();
      });
      request.addParameter('p', TYPES.JSON, '{"a":1}');

      connection.execSql(request);
    });
  });
});
