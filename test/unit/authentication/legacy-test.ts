import { assert } from 'chai';

import { createAzureAuthenticationProvider } from '../../../src/authentication/legacy/azure';
import { loadOptionalDependency } from '../../../src/authentication/legacy/optional-dependency';
import { ConnectionError } from '../../../src/errors';
import { type AuthenticationContext } from '../../../src/authentication/provider';

const context: AuthenticationContext = {
  server: 'localhost',
  port: 1433,
  instanceName: undefined,
  fedAuthRequired: true,
  signal: new AbortController().signal
};

describe('deprecated built-in authentication types', function() {
  describe('loadOptionalDependency', function() {
    it('returns the loaded module', async function() {
      const module = { some: 'module' };
      assert.strictEqual(await loadOptionalDependency('some-package', 'some-type', async () => module), module);
    });

    it('throws a descriptive error if the module can not be loaded', async function() {
      const loadError = new Error("Cannot find module 'some-package'");

      let error: any;
      try {
        await loadOptionalDependency('some-package', 'some-type', async () => { throw loadError; });
      } catch (err) {
        error = err;
      }

      assert.instanceOf(error, ConnectionError);
      assert.strictEqual(error.code, 'ELOGIN');
      assert.include(error.message, 'The `some-type` authentication type requires the `some-package` package');
      assert.include(error.message, '`npm install some-package`');
      assert.strictEqual(error.cause, loadError);
    });
  });

  describe('Microsoft Entra ID authentication types', function() {
    it('uses the `password` workflow for `azure-active-directory-password`', async function() {
      const provider = createAzureAuthenticationProvider({
        type: 'azure-active-directory-password',
        options: { userName: 'user', password: 'password', clientId: 'client', tenantId: 'tenant' }
      });

      const session = await provider.createSession(context);
      assert.strictEqual(session.type, 'federated');
      assert.propertyVal(session, 'library', 'msal');
      assert.propertyVal(session, 'workflow', 'password');
    });

    it('uses the `integrated` workflow for `azure-active-directory-service-principal-secret`', async function() {
      const provider = createAzureAuthenticationProvider({
        type: 'azure-active-directory-service-principal-secret',
        options: { clientId: 'client', clientSecret: 'secret', tenantId: 'tenant' }
      });

      const session = await provider.createSession(context);
      assert.strictEqual(session.type, 'federated');
      assert.propertyVal(session, 'library', 'msal');
      assert.propertyVal(session, 'workflow', 'integrated');
    });

    it('fails to acquire a token if the credential returns no token', async function() {
      const provider = createAzureAuthenticationProvider({
        type: 'token-credential',
        options: { credential: { async getToken() { return null; } } }
      });

      const session = await provider.createSession(context);
      assert(session.type === 'federated' && session.library === 'msal');

      let error: any;
      try {
        await session.getToken({ spn: 'https://database.windows.net/', stsUrl: 'https://login.windows.net/' }, context.signal);
      } catch (err) {
        error = err;
      }

      assert.instanceOf(error, Error);
      assert.strictEqual(error.message, 'The token credential did not return an access token.');
    });
  });
});
