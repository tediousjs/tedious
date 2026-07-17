import { assert } from 'chai';
import * as net from 'net';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

function getConfig() {
  const config = {
    ...defaultConfig,
    options: {
      ...defaultConfig.options,
      debug: debugOptionsFromEnv(),
      tdsVersion: process.env.TEDIOUS_TDS_VERSION
    }
  };

  return config;
}

describe('A `error` on the network socket', function() {
  let connection: Connection;

  beforeEach(function(done) {
    connection = new Connection(getConfig());
    connection.on('error', done);
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
    connection.connect((err) => {
      connection.removeListener('error', done);
      done(err);
    });
  });

  afterEach(function() {
    connection.close();
  });

  it('forwards the error to in-flight requests', function(done) {
    const socketError = new Error('socket error');
    connection.on('error', () => {});

    const request = new Request('WAITFOR 00:00:30', function(err) {
      assert.strictEqual(err, socketError);

      done();
    });

    connection.execSql(request);
    process.nextTick(() => {
      (connection.socket as net.Socket).emit('error', socketError);
    });
  });

  it('calls the request completion callback after closing the connection', function(done) {
    const socketError = new Error('socket error');
    connection.on('error', () => {});

    const request = new Request('WAITFOR 00:00:30', function(err) {
      assert.strictEqual(connection.closed, true);

      done();
    });

    connection.execSql(request);
    process.nextTick(() => {
      (connection.socket as net.Socket).emit('error', socketError);
    });
  });

  it('calls the request completion callback before emitting the `end` event', function(done) {
    const socketError = new Error('socket error');
    connection.on('error', () => {});

    let endEmitted = false;
    connection.on('end', () => {
      endEmitted = true;
    });

    const request = new Request('WAITFOR 00:00:30', function(err) {
      assert.strictEqual(endEmitted, false);

      process.nextTick(() => {
        assert.strictEqual(endEmitted, true);
        done();
      });
    });

    connection.execSql(request);
    process.nextTick(() => {
      (connection.socket as net.Socket).emit('error', socketError);
    });
  });
});
