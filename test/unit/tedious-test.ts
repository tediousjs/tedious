import { Connection, ISOLATION_LEVEL, TYPES } from '../../src/tedious';
import { assert } from 'chai';

describe('tedious-test', function() {

  it('types', () => {
    assert.ok(TYPES);
    assert.ok(TYPES.VarChar);
  });

  it('isolationLevel', () => {
    assert.ok(ISOLATION_LEVEL);
    assert.ok(ISOLATION_LEVEL.READ_UNCOMMITTED);
  });

  it('connection', () => {
    assert.ok(Connection);
  });

  it('connectionDoesNotModifyPassedConfig', () => {
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

    assert.notStrictEqual(connection.config, config);
    assert.notStrictEqual(connection.config.options, config.options);

    // Test that we did not do a deep copy of the cryptoCredentialsDetails,
    // as we never modify that value inside tedious.
    assert.strictEqual(
      connection.config.options.cryptoCredentialsDetails,
      config.options.cryptoCredentialsDetails
    );
  });
});
