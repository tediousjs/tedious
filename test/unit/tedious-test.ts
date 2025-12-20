import { Connection, ISOLATION_LEVEL, TYPES } from '../../src/tedious';
import { assert } from 'chai';

describe('tedious-test', function() {

  it('types', function() {
    assert.isDefined(TYPES);
    assert.isDefined(TYPES.VarChar);
  });

  it('isolationLevel', function() {
    assert.isDefined(ISOLATION_LEVEL);
    assert.isDefined(ISOLATION_LEVEL.READ_UNCOMMITTED);
  });

  it('connection', function() {
    assert.isDefined(Connection);
  });

  it('connectionDoesNotModifyPassedConfig', function() {
    const config = {
      server: 'localhost',
      userName: 'sa',
      password: 'sapwd',
      options: {
        encrypt: false as const,
        port: 1234,
        cryptoCredentialsDetails: {
          ciphers: 'DEFAULT'
        }
      }
    };

    const connection = new Connection(config);

    assert.notStrictEqual(connection.config, config as any);
    assert.notStrictEqual(connection.config.options, config.options as any);

    // Test that we did not do a deep copy of the cryptoCredentialsDetails,
    // as we never modify that value inside tedious.
    assert.strictEqual(
      connection.config.options.cryptoCredentialsDetails,
      config.options.cryptoCredentialsDetails
    );
  });
});
