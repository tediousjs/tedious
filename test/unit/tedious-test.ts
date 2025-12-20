import { Connection, ISOLATION_LEVEL, TYPES } from '../../src/tedious';
import { assert } from 'chai';

describe('Tedious', function() {

  it('should export TYPES', () => {
    assert.ok(TYPES);
    assert.ok(TYPES.VarChar);
  });

  it('should export ISOLATION_LEVEL', () => {
    assert.ok(ISOLATION_LEVEL);
    assert.ok(ISOLATION_LEVEL.READ_UNCOMMITTED);
  });

  it('should export Connection', () => {
    assert.ok(Connection);
  });

  it('should not modify the passed config object', () => {
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
