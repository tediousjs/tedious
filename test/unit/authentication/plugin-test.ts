import { assert } from 'chai';

import { Connection, registerAuthenticationPlugin, type AuthenticationPlugin, type AuthenticationProvider } from '../../../src/tedious';

let pluginCount = 0;

/**
 * The plugin registry is process wide, so every test uses its own,
 * unique authentication type.
 */
function uniqueType() {
  return `test-plugin-${++pluginCount}`;
}

function createProvider(): AuthenticationProvider {
  return {
    getCredentials() {
      return { type: 'password', userName: 'user', password: 'password' };
    }
  };
}

describe('Authentication plugins', function() {
  describe('in a JSON based configuration', function() {
    it('selects the registered plugin by its type and passes it the options', function() {
      const type = uniqueType();
      const provider = createProvider();
      const receivedOptions: unknown[] = [];

      registerAuthenticationPlugin({
        type: type,
        createProvider(options) {
          receivedOptions.push(options);
          return provider;
        }
      });

      const config = JSON.parse(JSON.stringify({
        server: 'localhost',
        authentication: { type: type, options: { realm: 'EXAMPLE.COM', mutual: true } },
        options: { encrypt: false }
      }));

      const connection = new Connection(config);

      assert.deepEqual(receivedOptions, [{ realm: 'EXAMPLE.COM', mutual: true }]);
      assert.strictEqual(connection.authenticationProvider, provider);
      assert.deepEqual(connection.config.authentication, { type: type, options: { realm: 'EXAMPLE.COM', mutual: true } });
    });

    it('passes an empty object if no options are given', function() {
      const type = uniqueType();
      const receivedOptions: unknown[] = [];

      registerAuthenticationPlugin({
        type: type,
        createProvider(options) {
          receivedOptions.push(options);
          return createProvider();
        }
      });

      new Connection({ server: 'localhost', authentication: { type: type } });

      assert.deepEqual(receivedOptions, [{}]);
    });

    it('throws if the authentication type is not registered', function() {
      assert.throws(() => {
        new Connection({ server: 'localhost', authentication: { type: 'not-registered', options: {} } });
      }, TypeError, /The "config.authentication.type" property must be one of the registered authentication types \("default", "ntlm", .*\)\. If "not-registered" is provided by a plugin, register the plugin with `registerAuthenticationPlugin\(\)` before creating the connection\./);
    });

    it('throws the errors thrown by the plugin when validating the options', function() {
      const type = uniqueType();

      registerAuthenticationPlugin({
        type: type,
        createProvider(options: { realm?: unknown }) {
          if (typeof options.realm !== 'string') {
            throw new TypeError('The "config.authentication.options.realm" property must be of type string.');
          }

          return createProvider();
        }
      });

      assert.throws(() => {
        new Connection({ server: 'localhost', authentication: { type: type, options: { realm: 42 } } });
      }, TypeError, 'The "config.authentication.options.realm" property must be of type string.');
    });

    it('throws if the plugin does not return an authentication provider', function() {
      const type = uniqueType();

      registerAuthenticationPlugin({
        type: type,
        createProvider() {
          return {} as AuthenticationProvider;
        }
      });

      assert.throws(() => {
        new Connection({ server: 'localhost', authentication: { type: type, options: {} } });
      }, TypeError, `The authentication plugin for the "${type}" authentication type did not return an authentication provider.`);
    });

    it('validates the options of the built-in authentication types', function() {
      assert.throws(() => {
        new Connection({ server: 'localhost', authentication: { type: 'default', options: { userName: 42 } } });
      }, TypeError, 'The "config.authentication.options.userName" property must be of type string.');

      assert.throws(() => {
        new Connection({ server: 'localhost', authentication: { type: 'ntlm', options: {} } });
      }, TypeError, 'The "config.authentication.options.domain" property must be of type string.');

      assert.throws(() => {
        new Connection({ server: 'localhost', authentication: { type: 'azure-active-directory-service-principal-secret', options: { clientId: 'client' } } });
      }, TypeError, 'The "config.authentication.options.clientSecret" property must be of type string.');
    });
  });

  describe('registerAuthenticationPlugin', function() {
    it('ignores registering the same plugin again', function() {
      const plugin: AuthenticationPlugin = { type: uniqueType(), createProvider: createProvider };

      registerAuthenticationPlugin(plugin);
      registerAuthenticationPlugin(plugin);
    });

    it('throws when registering a different plugin for an already registered type', function() {
      const type = uniqueType();
      registerAuthenticationPlugin({ type: type, createProvider: createProvider });

      assert.throws(() => {
        registerAuthenticationPlugin({ type: type, createProvider: createProvider });
      }, Error, `An authentication plugin for the "${type}" authentication type is already registered.`);
    });

    it('does not allow replacing the built-in authentication types', function() {
      assert.throws(() => {
        registerAuthenticationPlugin({ type: 'default', createProvider: createProvider });
      }, Error, 'An authentication plugin for the "default" authentication type is already registered.');
    });

    it('validates the plugin', function() {
      assert.throws(() => {
        registerAuthenticationPlugin(undefined as any);
      }, TypeError, 'The "plugin" argument must be of type object.');

      assert.throws(() => {
        registerAuthenticationPlugin({ type: '', createProvider: createProvider });
      }, TypeError, 'The "plugin.type" property must be a non-empty string.');

      assert.throws(() => {
        registerAuthenticationPlugin({ type: uniqueType() } as any);
      }, TypeError, 'The "plugin.createProvider" property must be of type function.');
    });
  });
});
