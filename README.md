# Tedious (node implementation of TDS)
[![NPM version](https://badge.fury.io/js/tedious.svg)](http://badge.fury.io/js/tedious) [![Build Status](https://ci.appveyor.com/api/projects/status/ike3p58hljpyffrl?svg=true)](https://ci.appveyor.com/project/tediousjs/tedious) [![Code Coverage](https://codecov.io/gh/tediousjs/tedious/badge.svg)](https://codecov.io/gh/tediousjs/tedious)


Tedious is a pure-Javascript implementation of the [TDS protocol](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-tds/b46a581a-39de-4745-b076-ec4dbb7d13ec),
which is used to interact with instances of Microsoft's SQL Server. It is intended to be a fairly slim implementation of the protocol, with not too much additional functionality.

See the [changelog](https://github.com/tediousjs/tedious/releases) for version history.

### Supported TDS versions

- TDS 7.4 (SQL Server 2012/2014/2016/2017/2019/2022/2025)
- TDS 7.3.B (SQL Server 2008 R2)
- TDS 7.3.A (SQL Server 2008)
- TDS 7.2 (SQL Server 2005)
- TDS 7.1 (SQL Server 2000) - *deprecated, support will be removed in a future version*

TDS 8.0 (SQL Server 2022 and later) is supported by setting `options.encrypt` to `'strict'`.

## Installation

Node.js is a prerequisite for installing tedious. Once you have installed [Node.js](https://nodejs.org/), installing tedious is simple:

    npm install tedious

## Getting Started
- [Node.js SQL Server Guide](https://learn.microsoft.com/en-us/sql/connect/node-js/node-js-driver-for-sql-server)
- [Node.js + macOS](https://learn.microsoft.com/en-us/sql/connect/node-js/step-1-configure-development-environment-for-node-js-development#macos)
- [Node.js + Red Hat Enterprise Linux](https://learn.microsoft.com/en-us/sql/linux/install-upgrade/quickstart-install-red-hat)
- [Node.js + SUSE Linux Enterprise Server](https://learn.microsoft.com/en-us/sql/linux/install-upgrade/quickstart-install-suse)
- [Node.js + Ubuntu](https://learn.microsoft.com/en-us/sql/connect/node-js/step-1-configure-development-environment-for-node-js-development#ubuntu-linux)
- [Node.js + Windows](https://learn.microsoft.com/en-us/sql/connect/node-js/step-1-configure-development-environment-for-node-js-development#windows)

<a name="documentation"></a>
## Documentation
More documentation and code samples are available at [tediousjs.github.io/tedious/](http://tediousjs.github.io/tedious/)

<a name="always-encrypted"></a>
## Always Encrypted
[Always Encrypted](https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/always-encrypted-database-engine) keeps
the values of encrypted columns, and the keys that protect them, from being revealed to SQL Server. With the `columnEncryption` option
set, `tedious` decrypts the values of encrypted columns when they are read, and encrypts the values of the parameters that target
encrypted columns before they are sent:

```js
const { Connection, AzureKeyVaultKeyStoreProvider } = require('tedious');
const { DefaultAzureCredential } = require('@azure/identity');
const { CryptographyClient } = require('@azure/keyvault-keys');

const credential = new DefaultAzureCredential();

const connection = new Connection({
  // ...
  options: {
    columnEncryption: {
      // By the name of the key store that the column master keys were created with
      keyStoreProviders: {
        AZURE_KEY_VAULT: new AzureKeyVaultKeyStoreProvider((keyId) => new CryptographyClient(keyId, credential))
      }
    }
  }
});
```

Column master keys are accessed through key store providers:

- `AzureKeyVaultKeyStoreProvider` for keys stored in Azure Key Vault or Managed HSM. It is given a function that creates the
  `CryptographyClient` of a key, so `tedious` does not depend on `@azure/keyvault-keys` itself.
- `RsaKeyStoreProvider` for RSA keys that the application has at hand, e.g. the exported private key of a certificate. It reads the
  format of the `MSSQL_CERTIFICATE_STORE` and `MSSQL_JAVA_KEYSTORE` key stores.
- Any object with a `decryptColumnEncryptionKey(masterKeyPath, encryptionAlgorithm, encryptedColumnEncryptionKey)` method, for other key
  stores.

Things to know:

- Requires TDS 7.4 and SQL Server 2016 or later.
- The type of a parameter (including its length, precision and scale) needs to match the type of the encrypted column it targets, as
  the server is not able to convert encrypted values.
- Before a request with parameters is executed for the first time, the server is asked which of its parameters need to be encrypted.
  Requests that are known not to need this can opt out via `new Request(sql, callback, { columnEncryption: 'resultSetOnly' })`.
- The server is what tells which parameters to encrypt. Add parameters that hold sensitive values with `{ forceEncrypt: true }` to make
  a request fail instead of sending such a value as it is.
- Bulk loads, table-valued parameters and values that are read from a stream are not encrypted, and secure enclaves are not supported.

See [`examples/always-encrypted.js`](examples/always-encrypted.js) for a complete example.

<a name="name"></a>
## Name
_Tedious_ is simply derived from a fast, slightly garbled, pronunciation of the letters T, D and S.

<a name="contributing"></a>
## Contributing
We welcome contributions from the community. Feel free to checkout the code and submit pull requests.

## Security
Please report security vulnerabilities privately. See our [security policy](SECURITY.md) for reporting instructions.

<a name="license"></a>
## License

Copyright (c) 2010-2026 Mike D Pilsbury

The MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
