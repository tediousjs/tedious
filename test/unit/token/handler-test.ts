import { assert } from 'chai';

import { Login7TokenHandler } from '../../../src/token/handler';
import { FeatureExtAckToken } from '../../../src/token/token';
import { ConnectionError } from '../../../src/errors';
import type Connection from '../../../src/connection';

function buildConnection(): Connection {
  return {
    config: { authentication: { type: 'default', options: {} } },
    serverSupportsJson: false
  } as unknown as Connection;
}

describe('Login7TokenHandler', function() {
  describe('#onFeatureExtAck', function() {
    it('marks the server as json capable for a version 1 JSON support acknowledgement', function() {
      const connection = buildConnection();
      const handler = new Login7TokenHandler(connection);

      handler.onFeatureExtAck(new FeatureExtAckToken(undefined, undefined, Buffer.from([0x01])));

      assert.isTrue(connection.serverSupportsJson);
      assert.isUndefined(handler.loginError);
    });

    it('leaves the server marked as not json capable without a JSON support acknowledgement', function() {
      const connection = buildConnection();
      const handler = new Login7TokenHandler(connection);

      handler.onFeatureExtAck(new FeatureExtAckToken(undefined, true, undefined));

      assert.isFalse(connection.serverSupportsJson);
      assert.isUndefined(handler.loginError);
    });

    it('fails the login for a JSON support acknowledgement with an unknown version', function() {
      const connection = buildConnection();
      const handler = new Login7TokenHandler(connection);

      handler.onFeatureExtAck(new FeatureExtAckToken(undefined, undefined, Buffer.from([0x02])));

      assert.isFalse(connection.serverSupportsJson);
      assert.instanceOf(handler.loginError, ConnectionError);
      assert.strictEqual(handler.loginError!.message, 'Received invalid JSON support acknowledgement');
    });

    it('fails the login for a JSON support acknowledgement with invalid data', function() {
      for (const data of [Buffer.alloc(0), Buffer.from([0x01, 0x01])]) {
        const connection = buildConnection();
        const handler = new Login7TokenHandler(connection);

        handler.onFeatureExtAck(new FeatureExtAckToken(undefined, undefined, data));

        assert.isFalse(connection.serverSupportsJson);
        assert.instanceOf(handler.loginError, ConnectionError);
        assert.strictEqual(handler.loginError!.message, 'Received invalid JSON support acknowledgement');
      }
    });
  });
});
