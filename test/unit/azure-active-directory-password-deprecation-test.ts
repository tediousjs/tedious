import { Connection } from '../../src/tedious';
import { azureActiveDirectoryPasswordDeprecationWarning } from '../../src/token/handler';
import { assert } from 'chai';

describe('Azure Active Directory password authentication deprecation warning', function() {
  let warnings: (Error & { code?: string })[];

  const onWarning = (warning: Error & { code?: string }) => {
    if (warning.code === 'TEDIOUS_DEP_AAD_PASSWORD') {
      warnings.push(warning);
    }
  };

  beforeEach(function() {
    azureActiveDirectoryPasswordDeprecationWarning.emitted = false;
    warnings = [];
    process.on('warning', onWarning);
  });

  afterEach(function() {
    process.removeListener('warning', onWarning);
  });

  it('emits a deprecation warning once when the authentication method is configured', function(done) {
    const config = {
      server: 'localhost',
      authentication: {
        type: 'azure-active-directory-password' as const,
        options: {
          clientId: 'client-id'
        }
      }
    };

    const firstConnection = new Connection(config);
    const secondConnection = new Connection(config);

    firstConnection.close();
    secondConnection.close();

    // `process.emitWarning` emits the `warning` event asynchronously.
    setImmediate(() => {
      assert.lengthOf(warnings, 1);
      assert.strictEqual(warnings[0].name, 'DeprecationWarning');
      assert.strictEqual(warnings[0].code, 'TEDIOUS_DEP_AAD_PASSWORD');
      assert.match(warnings[0].message, /azure-active-directory-password.*deprecated/);

      done();
    });
  });
});
