import { assert } from 'chai';

import { Connection, type AuthenticationPlugin, type AuthenticationProvider } from '../../../src/tedious';

function createProvider(): AuthenticationProvider {
  return {
    getCredentials() {
      return { type: 'password', userName: 'user', password: 'password' };
    }
  };
}

describe('Authentication plugins', function() {
  it('selects the plugin by the type in a JSON based configuration and passes it the options', function() {
    const provider = createProvider();
    const receivedOptions: unknown[] = [];

    const kerberos: AuthenticationPlugin = {
      type: 'kerberos',
      createProvider(options) {
        receivedOptions.push(options);
        return provider;
      }
    };

    const config = JSON.parse(JSON.stringify({
      server: 'localhost',
      authentication: { type: 'kerberos', options: { realm: 'EXAMPLE.COM', mutual: true } },
      options: { encrypt: false }
    }));

    const connection = new Connection(config, { authenticationPlugins: [kerberos] });

    assert.deepEqual(receivedOptions, [{ realm: 'EXAMPLE.COM', mutual: true }]);
    assert.strictEqual(connection.authenticationProvider, provider);
    assert.deepEqual(connection.config.authentication, { type: 'kerberos', options: { realm: 'EXAMPLE.COM', mutual: true } });
  });

  it('passes an empty object if no options are given', function() {
    const receivedOptions: unknown[] = [];

    new Connection({ server: 'localhost', authentication: { type: 'kerberos' } }, {
      authenticationPlugins: [{
        type: 'kerberos',
        createProvider(options) {
          receivedOptions.push(options);
          return createProvider();
        }
      }]
    });

    assert.deepEqual(receivedOptions, [{}]);
  });

  it('only makes plugins available to the connection they were passed to', function() {
    const kerberos: AuthenticationPlugin = { type: 'kerberos', createProvider: createProvider };
    new Connection({ server: 'localhost', authentication: { type: 'kerberos' } }, { authenticationPlugins: [kerberos] });

    assert.throws(() => {
      new Connection({ server: 'localhost', authentication: { type: 'kerberos' } });
    }, TypeError, /If "kerberos" is provided by a plugin/);
  });

  it('throws if the authentication type is not available', function() {
    assert.throws(() => {
      new Connection({ server: 'localhost', authentication: { type: 'kerberos', options: {} } });
    }, TypeError, /^The "config.authentication.type" property must be one of the available authentication types \("default", "ntlm", .*\)\. If "kerberos" is provided by a plugin, pass the plugin to the connection via `extensions.authenticationPlugins`\.$/);
  });

  it('uses a plugin for a built-in authentication type instead of the built-in implementation', function() {
    const provider = createProvider();
    const ntlm: AuthenticationPlugin = { type: 'ntlm', createProvider: () => provider };

    // The built-in `ntlm` type would reject these options.
    const connection = new Connection({ server: 'localhost', authentication: { type: 'ntlm', options: {} } }, { authenticationPlugins: [ntlm] });

    assert.strictEqual(connection.authenticationProvider, provider);
  });

  it('throws the errors thrown by the plugin when validating the options', function() {
    const kerberos: AuthenticationPlugin = {
      type: 'kerberos',
      createProvider(options: { realm?: unknown }) {
        if (typeof options.realm !== 'string') {
          throw new TypeError('The "config.authentication.options.realm" property must be of type string.');
        }

        return createProvider();
      }
    };

    assert.throws(() => {
      new Connection({ server: 'localhost', authentication: { type: 'kerberos', options: { realm: 42 } } }, { authenticationPlugins: [kerberos] });
    }, TypeError, 'The "config.authentication.options.realm" property must be of type string.');
  });

  it('throws if the plugin does not return an authentication provider', function() {
    const kerberos: AuthenticationPlugin = { type: 'kerberos', createProvider: () => ({}) as AuthenticationProvider };

    assert.throws(() => {
      new Connection({ server: 'localhost', authentication: { type: 'kerberos', options: {} } }, { authenticationPlugins: [kerberos] });
    }, TypeError, 'The authentication plugin for the "kerberos" authentication type did not return an authentication provider.');
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

  describe('validation of `extensions.authenticationPlugins`', function() {
    function createConnection(extensions: any) {
      return new Connection({ server: 'localhost' }, extensions);
    }

    it('throws if `extensions` is not an object', function() {
      assert.throws(() => createConnection(null), TypeError, 'The "extensions" argument must be of type Object.');
    });

    it('throws if `authenticationPlugins` is not an array', function() {
      assert.throws(() => createConnection({ authenticationPlugins: {} }), TypeError, 'The "extensions.authenticationPlugins" property must be an array.');
    });

    it('throws if a plugin is invalid', function() {
      assert.throws(() => {
        createConnection({ authenticationPlugins: [null] });
      }, TypeError, 'The "extensions.authenticationPlugins[0]" property must be of type object.');

      assert.throws(() => {
        createConnection({ authenticationPlugins: [{ type: '', createProvider: createProvider }] });
      }, TypeError, 'The "extensions.authenticationPlugins[0].type" property must be a non-empty string.');

      assert.throws(() => {
        createConnection({ authenticationPlugins: [{ type: 'kerberos', createProvider: createProvider }, { type: 'other' }] });
      }, TypeError, 'The "extensions.authenticationPlugins[1].createProvider" property must be of type function.');
    });

    it('throws if two plugins have the same type', function() {
      assert.throws(() => {
        createConnection({ authenticationPlugins: [{ type: 'kerberos', createProvider: createProvider }, { type: 'kerberos', createProvider: createProvider }] });
      }, TypeError, 'The "extensions.authenticationPlugins" property contains more than one plugin for the "kerberos" authentication type.');
    });
  });
});
