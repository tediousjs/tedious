import { assert } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sinon from 'sinon';

import { Connection } from '../../../src/tedious';
import { getAuthenticationPluginPackageName } from '../../../src/authentication/plugin';

/**
 * Writes the given files into `<appDir>/node_modules/<packageName>/`.
 */
function installPackage(appDir: string, packageName: string, files: Record<string, string>) {
  const packageDir = path.join(appDir, 'node_modules', ...packageName.split('/'));
  fs.mkdirSync(packageDir, { recursive: true });

  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(packageDir, name), contents);
  }
}

describe('Authentication plugins', function() {
  describe('getAuthenticationPluginPackageName', function() {
    it('maps authentication types to plugin package names', function() {
      assert.strictEqual(getAuthenticationPluginPackageName('kerberos'), 'tedious-auth-kerberos');
      assert.strictEqual(getAuthenticationPluginPackageName('tedious-auth-kerberos'), 'tedious-auth-kerberos');
      assert.strictEqual(getAuthenticationPluginPackageName('@acme/kerberos'), '@acme/tedious-auth-kerberos');
      assert.strictEqual(getAuthenticationPluginPackageName('@acme/tedious-auth-kerberos'), '@acme/tedious-auth-kerberos');
      assert.strictEqual(getAuthenticationPluginPackageName('@acme'), '@acme/tedious-auth');
      assert.strictEqual(getAuthenticationPluginPackageName('@acme/tedious-auth'), '@acme/tedious-auth');
    });

    it('rejects anything that is not a package name', function() {
      for (const type of ['', 'Kerberos', '../kerberos', './kerberos', '/kerberos', 'kerberos/index.js', '@acme/../kerberos', '@acme/kerberos/index.js', 'node:fs', 'C:\\kerberos']) {
        assert.throws(() => {
          getAuthenticationPluginPackageName(type);
        }, TypeError, `The "config.authentication.type" property must be the name of a built-in authentication type or of an authentication plugin, but "${type}" is neither.`);
      }
    });
  });

  describe('in a JSON based configuration', function() {
    let appDir: string;

    before(function() {
      appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tedious-auth-plugin-test-'));

      installPackage(appDir, 'tedious-auth-commonjs', {
        'package.json': JSON.stringify({ name: 'tedious-auth-commonjs', version: '1.0.0', main: 'index.js' }),
        'index.js': `
          exports.createProvider = function(options) {
            if (options.realm !== undefined && typeof options.realm !== 'string') {
              throw new TypeError('The "config.authentication.options.realm" property must be of type string.');
            }

            return {
              options: options,
              getCredentials() {
                return { type: 'password', userName: 'commonjs' };
              }
            };
          };
        `
      });

      installPackage(appDir, '@acme/tedious-auth-esm', {
        'package.json': JSON.stringify({ name: '@acme/tedious-auth-esm', version: '1.0.0', type: 'module', exports: './index.js' }),
        'index.js': `
          export default {
            createProvider(options) {
              return {
                options: options,
                getCredentials() {
                  return { type: 'password', userName: 'esm' };
                }
              };
            }
          };
        `
      });

      installPackage(appDir, 'tedious-auth-throws', {
        'package.json': JSON.stringify({ name: 'tedious-auth-throws', version: '1.0.0', main: 'index.js' }),
        'index.js': 'throw new Error(\'native module failed to load\');'
      });

      installPackage(appDir, 'tedious-auth-not-a-plugin', {
        'package.json': JSON.stringify({ name: 'tedious-auth-not-a-plugin', version: '1.0.0', main: 'index.js' }),
        'index.js': 'exports.somethingElse = true;'
      });

      installPackage(appDir, 'tedious-auth-no-provider', {
        'package.json': JSON.stringify({ name: 'tedious-auth-no-provider', version: '1.0.0', main: 'index.js' }),
        'index.js': 'exports.createProvider = function() { return {}; };'
      });

      installPackage(appDir, 'tedious-auth-ntlm', {
        'package.json': JSON.stringify({ name: 'tedious-auth-ntlm', version: '1.0.0', main: 'index.js' }),
        'index.js': 'throw new Error(\'should not be loaded\');'
      });
    });

    after(function() {
      fs.rmSync(appDir, { recursive: true, force: true });
    });

    beforeEach(function() {
      // Plugins that tedious itself cannot see are looked up from the
      // current working directory.
      sinon.stub(process, 'cwd').returns(appDir);
    });

    afterEach(function() {
      sinon.restore();
    });

    function createConnection(authentication: object) {
      // Round-trip through JSON, to make sure the configuration is plain data.
      return new Connection(JSON.parse(JSON.stringify({ server: 'localhost', authentication: authentication })));
    }

    it('loads a CommonJS plugin package and passes it the options', async function() {
      const connection = createConnection({ type: 'commonjs', options: { realm: 'EXAMPLE.COM' } });

      assert.deepEqual((connection.authenticationProvider as any).options, { realm: 'EXAMPLE.COM' });
      assert.deepEqual(await connection.authenticationProvider.getCredentials({} as any), { type: 'password', userName: 'commonjs' });
      assert.deepEqual(connection.config.authentication, { type: 'commonjs', options: { realm: 'EXAMPLE.COM' } });
    });

    it('loads an ESM plugin package from a scope via its default export', async function() {
      const connection = createConnection({ type: '@acme/esm' });

      assert.deepEqual((connection.authenticationProvider as any).options, {});
      assert.deepEqual(await connection.authenticationProvider.getCredentials({} as any), { type: 'password', userName: 'esm' });
    });

    it('accepts the full package name as the type', function() {
      const connection = createConnection({ type: 'tedious-auth-commonjs' });

      assert.isFunction(connection.authenticationProvider.getCredentials);
    });

    it('throws the errors thrown by the plugin when validating the options', function() {
      assert.throws(() => {
        createConnection({ type: 'commonjs', options: { realm: 42 } });
      }, TypeError, 'The "config.authentication.options.realm" property must be of type string.');
    });

    it('throws if the plugin package is not installed', function() {
      assert.throws(() => {
        createConnection({ type: 'kerberos' });
      }, Error, 'The "kerberos" authentication type is provided by the "tedious-auth-kerberos" package, which could not be found. Install it with `npm install tedious-auth-kerberos`.');
    });

    it('throws if the plugin package fails to load', function() {
      let error: any;
      try {
        createConnection({ type: 'throws' });
      } catch (err: any) {
        error = err;
      }

      assert.instanceOf(error, Error);
      assert.strictEqual(error.message, 'Failed to load the "tedious-auth-throws" authentication plugin: native module failed to load');
      assert.strictEqual((error.cause as Error).message, 'native module failed to load');
    });

    it('throws if the package does not export `createProvider`', function() {
      assert.throws(() => {
        createConnection({ type: 'not-a-plugin' });
      }, TypeError, 'The "tedious-auth-not-a-plugin" package is not an authentication plugin, as it does not export a `createProvider` function.');
    });

    it('throws if the plugin does not return an authentication provider', function() {
      assert.throws(() => {
        createConnection({ type: 'no-provider' });
      }, TypeError, 'The authentication plugin for the "no-provider" authentication type did not return an authentication provider.');
    });

    it('prefers the built-in authentication types over plugin packages', function() {
      // `tedious-auth-ntlm` throws when loaded, so this would fail if it was used.
      assert.throws(() => {
        createConnection({ type: 'ntlm', options: {} });
      }, TypeError, 'The "config.authentication.options.domain" property must be of type string.');
    });

    it('validates the options of the built-in authentication types', function() {
      assert.throws(() => {
        createConnection({ type: 'default', options: { userName: 42 } });
      }, TypeError, 'The "config.authentication.options.userName" property must be of type string.');

      assert.throws(() => {
        createConnection({ type: 'azure-active-directory-service-principal-secret', options: { clientId: 'client' } });
      }, TypeError, 'The "config.authentication.options.clientSecret" property must be of type string.');
    });
  });
});
