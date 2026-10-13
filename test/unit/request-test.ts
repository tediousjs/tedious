import { assert } from 'chai';
import { TYPES } from '../../src/data-type';
import Request from '../../src/request';

describe('Request', function() {
  it('starts out as not being canceled', function() {
    const request = new Request('SELECT 1', () => {});
    assert.strictEqual(request.canceled, false);
  });

  describe('#cancel', function() {
    it('marks the request as canceled', function() {
      const request = new Request('', () => {});
      request.cancel();
      assert.strictEqual(request.canceled, true);
    });

    it('emits a `cancel` event', function() {
      const request = new Request('', () => {});

      let eventEmitted = false;
      request.on('cancel', () => { eventEmitted = true; });
      request.cancel();

      assert.strictEqual(eventEmitted, true);
    });

    it('only emits the `cancel` event on the first call', function() {
      const request = new Request('', () => {});
      request.cancel();

      let eventEmitted = false;
      request.on('cancel', () => { eventEmitted = true; });
      request.cancel();

      assert.strictEqual(eventEmitted, false);
    });
  });

  describe('`requestCompleted` event', function() {
    it('is emitted with the completion arguments when no callback is given', function() {
      const request = new Request('SELECT 1');
      const rows = [[{ value: 1 }]];

      const calls: any[][] = [];
      request.on('requestCompleted', (...args) => { calls.push(args); });
      request.callback(null, 1, rows);

      assert.deepStrictEqual(calls, [[null, 1, rows]]);
    });

    it('is emitted with the error when the request fails and no callback is given', function() {
      const request = new Request('SELECT 1');
      const error = new Error('failed');

      const calls: any[][] = [];
      request.on('requestCompleted', (...args) => { calls.push(args); });
      request.callback(error);

      assert.deepStrictEqual(calls, [[error, undefined, undefined]]);
    });

    it('is emitted with the same arguments as the callback, after the callback', function() {
      const order: string[] = [];
      const request = new Request('SELECT 1', (err, rowCount) => {
        order.push(`callback:${err?.message}:${rowCount}`);
      });
      request.on('requestCompleted', (err, rowCount) => {
        order.push(`requestCompleted:${err?.message}:${rowCount}`);
      });
      request.callback(new Error('failed'), 0);

      assert.deepStrictEqual(order, ['callback:failed:0', 'requestCompleted:failed:0']);
    });
  });

  describe('#addOutputParameter', function() {
    it('does not modify the passed in options object', function() {
      const request = new Request('', () => {});

      request.addOutputParameter('foo', TYPES.NVarChar, 'test', Object.freeze({ length: 10 }));
    });
  });

  describe('#addParameter', function() {
    it('does not modify the passed in options object', function() {
      const request = new Request('', () => { });

      request.addParameter('foo', TYPES.NVarChar, 'test', Object.freeze({ length: 10 }));
    });
  });
});
