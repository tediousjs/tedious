// Reads and writes the encrypted columns of a table, using Always Encrypted
// with a column master key that is stored in Azure Key Vault.
//
// The example expects a table like the following one, whose column
// encryption key `CEK1` is protected by a column master key in the key vault
// (see https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/always-encrypted-database-engine
// for how to set one up):
//
//   CREATE TABLE [dbo].[patients] (
//     [id] int IDENTITY PRIMARY KEY,
//     [ssn] char(11) COLLATE Latin1_General_BIN2
//       ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK1], ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL,
//     [name] nvarchar(50) NOT NULL,
//     [birth_date] date
//       ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK1], ENCRYPTION_TYPE = RANDOMIZED, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NOT NULL
//   )
//
// `tedious` itself does not depend on the Azure Key Vault client, install it
// with `npm install @azure/identity @azure/keyvault-keys`.
const { DefaultAzureCredential } = require('@azure/identity');
const { CryptographyClient } = require('@azure/keyvault-keys');

const { AzureKeyVaultKeyStoreProvider, Connection, Request, TYPES } = require('../lib/tedious');

// The key store provider is given the means to access the keys in the key
// vault. It caches the column encryption keys that it decrypted, so the same
// provider should be used for all connections of an application.
const credential = new DefaultAzureCredential();
const keyVault = new AzureKeyVaultKeyStoreProvider((keyId) => new CryptographyClient(keyId, credential));

const config = {
  server: '192.168.1.212',
  authentication: {
    type: 'default',
    options: {
      userName: 'test',
      password: 'test'
    }
  },
  options: {
    port: 1433, // Default Port

    // Enables Always Encrypted for the connection.
    columnEncryption: {
      // The key store providers, by the name of the key store that the
      // column master key was created with.
      keyStoreProviders: {
        AZURE_KEY_VAULT: keyVault
      }
    }
  }
};

const connection = new Connection(config);

connection.connect((err) => {
  if (err) {
    console.log('Connection Failed!');
    throw err;
  }

  insertPatient();
});

// Parameters that target encrypted columns are encrypted before they are sent
//--------------------------------------------------------------------------------
function insertPatient() {
  const sql = 'INSERT INTO [dbo].[patients] ([ssn], [name], [birth_date]) VALUES (@ssn, @name, @birthDate)';
  const request = new Request(sql, (err, rowCount) => {
    if (err) {
      throw err;
    }

    console.log('rowCount: ', rowCount);
    findPatient();
  });

  // The types of the parameters need to match the types of the columns, as
  // the server is not able to convert encrypted values.
  //
  // `forceEncrypt` makes the request fail if the server does not ask for the
  // parameter to be encrypted, instead of sending the value as it is.
  request.addParameter('ssn', TYPES.Char, '795-73-9838', { length: 11, forceEncrypt: true });
  request.addParameter('name', TYPES.NVarChar, 'Catherine Abel');
  request.addParameter('birthDate', TYPES.Date, new Date('1996-09-10'), { forceEncrypt: true });

  connection.execSql(request);
}

// The values of encrypted columns are decrypted when they are read
//--------------------------------------------------------------------------------
function findPatient() {
  // Columns that use deterministic encryption can be compared for equality.
  const sql = 'SELECT [id], [ssn], [name], [birth_date] FROM [dbo].[patients] WHERE [ssn] = @ssn';
  const request = new Request(sql, (err) => {
    if (err) {
      throw err;
    }

    readEncryptedValues();
  });

  request.addParameter('ssn', TYPES.Char, '795-73-9838', { length: 11 });

  request.on('row', (columns) => {
    for (const column of columns) {
      const encryption = column.metadata.cryptoMetadata ? ` (${column.metadata.cryptoMetadata.encryptionType} encryption)` : '';
      console.log(`${column.metadata.colName}${encryption}:`, column.value);
    }
  });

  connection.execSql(request);
}

// Column encryption can be controlled per request
//--------------------------------------------------------------------------------
function readEncryptedValues() {
  // `disabled` returns the values of encrypted columns as they are stored.
  // `resultSetOnly` decrypts the values of encrypted columns, but saves
  // asking the server which parameters of the request need to be encrypted.
  const request = new Request('SELECT [ssn] FROM [dbo].[patients]', (err) => {
    if (err) {
      throw err;
    }

    console.log('DONE!');
    connection.close();
  }, { columnEncryption: 'disabled' });

  request.on('row', (columns) => {
    console.log('encrypted ssn:', columns[0].value);
  });

  connection.execSql(request);
}
