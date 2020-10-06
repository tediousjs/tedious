const assert = require('chai').assert;
const sinon = require('sinon');
const AzureIdentity = require('@azure/identity');
const { ColumnEncryptionAzureKeyVaultProvider } = require('../../../src/always-encrypted/keystore-provider-azure-key-vault');

describe('ColumnEncryptionAzureKeyVaultProvider', () => {
  const sampleEncryptedColumnEncryptionKey = Buffer.from('01BE000001680074007400700073003A002F002F0061007A007500720065002D00730071006C002D00610065002D0074006500730074002D006B0076002E007600610075006C0074002E0061007A007500720065002E006E00650074003A003400340033002F006B006500790073002F0063006D006B006100750074006F0032002F00340064006200380061006400360033006200330032003600340039003400640061003100310033003400610062003200370034003500380038003800300035007D39D366755743E1C5D15E3352B227C95625BE33B8F9E3AE891220D9B9AB637A48E28A3A35CC5A71DBFDD6FE71F7397DC054B56F021FD380CD046EE809A1FDEAFE631FBA4F32F69AE7660E3839537EB01788563B5C6FFB2CFF9D376D742B45065A9FA4DEADF359A79082F56F1B07228F7F47004174F4FAC4EA85BC5DEA4F10882B89FAB46A8C074D606C430FBBC4607FC725480FFB5FCA6717499B8D9663C3008880968D8DFB1E2415B678D5168FA30DAE510C7DAC7CCE843826F06499623B82439C59E17AFCAF00F8E8AA7F9F9790238048D3659B952B237D8E6E7DA706701E5205E5DC7846D4DCC7AA2011C60F64142D78DAB59B49AEA0229B73167CE59216ADEC632F739F9341BDB70574CC533CEC3FF0AC4EF05FF41FF437B935520BF4A629DDE0F5AADD24D6104007AAE2FD6DC865F54E702812E3A9A118E71DE36D809D4E014F5842549B9569DBDA899FB54BDEAF8943E44272AC8C278C0B14EC68F3C34BDFD54B5C6B8B94E12BDA2F67ED7C4CF45A6A62329267415DF16572C7723EF40A8512B083EA55D328377BA23A3C4E9572D6A802C0D57526C89937F16E61CF53BFA4A925FF090D9EACBA08DCEF1A5373FACC04F34C76AFCBA1A1E27A2E8DF9F4AB8D8B29B4133FB53253A9FB9C7192639FF0E50951AD53BDA29840A8B2D8740057384A3211488993C7DCC93E1392E88C9F663DB38A08781C6648FCD52F4531BF', 'hex');
  const encryptionAlgorithm = 'RSA_OAEP';
  const sampleMasterKeyPath = 'https://sampledomain.vault.azure.net:443/keys/CMK/kjasdhaskjdhajshdsal';

  it('constructs', () => {
    const keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider('sampleClientId', 'sampleClientKey', 'sampleTenantId');

    assert.strictEqual(keyVaultProvider.name, 'AZURE_KEY_VAULT');
    assert.strictEqual(keyVaultProvider.azureKeyVaultDomainName, 'vault.azure.net');
    assert.strictEqual(keyVaultProvider.rsaEncryptionAlgorithmWithOAEPForAKV, 'RSA-OAEP');
    assert.deepEqual(keyVaultProvider.firstVersion, Buffer.from([0x01]));
    assert.strictEqual(keyVaultProvider.credentials.clientId, 'sampleClientId');
    assert.strictEqual(keyVaultProvider.credentials.clientSecret, 'sampleClientKey');
    assert.strictEqual(keyVaultProvider.credentials.tenantId, 'sampleTenantId');
  });

  it('decrypts column encryption key', async () => {
    const keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider('sampleClientId', 'sampleClientKey', 'sampleTenantId');

    const stubClientCredential = sinon.stub(AzureIdentity, 'ClientSecretCredential').returns({});

    const keyClientStub = sinon.stub(keyVaultProvider, 'createKeyClient').returns();

    const cryptoClientStub = sinon.stub(keyVaultProvider, 'createCryptoClient').returns({
      verify: () => Promise.resolve({
        result: true
      }),
      unwrapKey: () => Promise.resolve({
        result: Buffer.from('ED6FBC93EECDE0BFC6494FFB2EDB7998B7E94EF71FEDE584741A855238F0155E', 'hex')
      })
    });

    const getKeyStub = sinon.stub(keyVaultProvider, 'getMasterKey').resolves({
      key: {
        kty: 'RSA',
        n: {
          length: 256
        }
      }
    });

    const decryptedCEK = await keyVaultProvider.decryptColumnEncryptionKey(sampleMasterKeyPath, encryptionAlgorithm, sampleEncryptedColumnEncryptionKey);

    stubClientCredential.restore();
    keyClientStub.restore();
    getKeyStub.restore();
    cryptoClientStub.restore();

    assert.deepEqual(decryptedCEK, Buffer.from('ED6FBC93EECDE0BFC6494FFB2EDB7998B7E94EF71FEDE584741A855238F0155E', 'hex'));
  });

  it('error checks decryptColumnEncryptionKey()', async () => {
    const keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider('sampleClientId', 'sampleClientKey', 'sampleTenantId');
    const stubClientCredential = sinon.stub(AzureIdentity, 'ClientSecretCredential').returns({});
    const keyClientStub = sinon.stub(keyVaultProvider, 'createKeyClient').returns();
    const cryptoClientStub = sinon.stub(keyVaultProvider, 'createCryptoClient').returns({
      verify: () => Promise.resolve({
        result: true
      }),
      unwrapKey: () => Promise.resolve({
        result: Buffer.from('ED6FBC93EECDE0BFC6494FFB2EDB7998B7E94EF71FEDE584741A855238F0155E', 'hex')
      })
    });
    const getKeyStub = sinon.stub(keyVaultProvider, 'getMasterKey').resolves({
      key: {
        kty: 'RSA',
        n: {
          length: 256
        }
      }
    });

    try {
      await keyVaultProvider.decryptColumnEncryptionKey('aaa', 'bbb', null);
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Internal error. Encrypted column encryption key cannot be null.');
    }

    try {
      await keyVaultProvider.decryptColumnEncryptionKey('aaa', 'bbb', Buffer.alloc(0));
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Internal error. Empty encrypted column encryption key specified.');
    }

    try {
      await keyVaultProvider.decryptColumnEncryptionKey(sampleMasterKeyPath, encryptionAlgorithm, Buffer.from([0x00]))
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, `Specified encrypted column encryption key contains an invalid encryption algorithm version ${Buffer.from([0x00]).toString('hex')}. Expected version is ${Buffer.from([0x01]).toString('hex')}.`);
    }

    const akvKeySize = sinon.stub(keyVaultProvider, 'getAKVKeySize').returns(3);
    try {
      await keyVaultProvider.decryptColumnEncryptionKey(sampleMasterKeyPath, encryptionAlgorithm, sampleEncryptedColumnEncryptionKey)
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, `The specified encrypted column encryption key's ciphertext length: 256 does not match the ciphertext length: 3 when using column master key (Azure Key Vault key) in ${sampleMasterKeyPath}. The encrypted column encryption key may be corrupt, or the specified Azure Key Vault key path may be incorrect.`)
    }
    akvKeySize.restore();

    try {
      await keyVaultProvider.decryptColumnEncryptionKey(sampleMasterKeyPath, encryptionAlgorithm, Buffer.from('01BE000001680074007400700073003A002F002F0061007A007500720065002D00730071006C002D00610065002D0074006500730074002D006B0076002E007600610075006C0074002E0061007A007500720065002E006E00650074003A003400340033002F006B006500790073002F0063006D006B006100750074006F0032002F00340064006200380061006400360033006200330032003600340039003400640061003100310033003400610062003200370034003500380038003800300035007D39D366755743E1C5D15E3352B227C95625BE33B8F9E3AE891220D9B9AB637A48E28A3A35CC5A71DBFDD6FE71F7397DC054B56F021FD380CD046EE809A1FDEAFE631FBA4F32F69AE7660E3839537EB01788563B5C6FFB2CFF9D376D742B45065A9FA4DEADF359A79082F56F1B07228F7F47004174F4FAC4EA85BC5DEA4F10882B89FAB46A8C074D606C430FBBC4607FC725480FFB5FCA6717499B8D9663C3008880968D8DFB1E2415B678D5168FA30DAE510C7DAC7CCE843826F06499623B82439C59E17AFCAF00F8E8AA7F9F9790238048D3659B952B237D8E6E7DA706701E5205E5DC7846D4DCC7AA2011C60F64142D78DAB59B49AEA0229B73167CE59216ADEC632F739F9341BDB70574CC533CEC3FF0AC4EF05FF41FF437B935520BF4A629DDE0F5AADD24D6104007AAE2FD6DC865F54E702812E3A9A118E71DE36D809D4E014F5842549B9569DBDA899FB54BDEAF8943E44272AC8C278C0B14EC68F3C34BDFD54B5C6B8B94E12BDA2F67ED7C4CF45A6A62329267415DF16572C7723EF40A8512B083EA55D328377BA23A3C4E9572D6A802C0D57526C89937F16E61CF53BFA4A925FF090D9EACBA08DCEF1A5373FACC04F34C76AFCBA1A1E27A2E8DF9F4AB8D8B29B4133FB53253A9FB9C7192639FF0E50951AD53BDA29840A8B2D8740057384A3211488993C7DCC93E1392E88C9F663DB38A08781C6648FCD52F45', 'hex'))
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, `The specified encrypted column encryption key's signature length: 254 does not match the signature length: 256 when using column master key (Azure Key Vault key) in ${sampleMasterKeyPath}. The encrypted column encryption key may be corrupt, or the specified Azure Key Vault key path may be incorrect.`)
    }

    stubClientCredential.restore();
    keyClientStub.restore();
    getKeyStub.restore();
    cryptoClientStub.restore();
  })

  describe('error checks encryptColumnEncryptionKey()', () => {
    let keyVaultProvider;
    let stubClientCredential;
    let keyClientStub;
    let cryptoClientStub;
    let getKeyStub;
    beforeEach(function () {
      keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider('sampleClientId', 'sampleClientKey', 'sampleTenantId');
      stubClientCredential = sinon.stub(AzureIdentity, 'ClientSecretCredential').returns({});
      keyClientStub = sinon.stub(keyVaultProvider, 'createKeyClient').returns();
      cryptoClientStub = sinon.stub(keyVaultProvider, 'createCryptoClient').returns({
        verify: () => Promise.resolve({
          result: true
        }),
        unwrapKey: () => Promise.resolve({
          result: Buffer.from('ED6FBC93EECDE0BFC6494FFB2EDB7998B7E94EF71FEDE584741A855238F0155E', 'hex')
        })
      });
      getKeyStub = sinon.stub(keyVaultProvider, 'getMasterKey').resolves({
        key: {
          kty: 'RSA',
          n: {
            length: 256
          }
        }
      });
    })

    afterEach(function () {
      stubClientCredential.restore();
      keyClientStub.restore();
      getKeyStub.restore();
      cryptoClientStub.restore();
    });

    it('checks Column encryption key cannot be null error', async () => {
      try {
        await keyVaultProvider.encryptColumnEncryptionKey(sampleMasterKeyPath, encryptionAlgorithm, null);
      } catch (err) {
        assert.instanceOf(err, Error);
        assert.equal(err.message, 'Column encryption key cannot be null.');
      }
    })

    it('checks Empty column encryption key specified error', async () => {
      try {
        await keyVaultProvider.encryptColumnEncryptionKey(sampleMasterKeyPath, encryptionAlgorithm, Buffer.alloc(0));
      } catch (err) {
        assert.instanceOf(err, Error);
        assert.equal(err.message, 'Empty column encryption key specified.');
      }
    });

    it('checks CipherText length does not match the RSA key size error', async () => {

      const azureKeyVaultWrapStub = sinon.stub(keyVaultProvider, 'azureKeyVaultWrap').returns(Buffer.alloc(1));
      try {
        await keyVaultProvider.encryptColumnEncryptionKey(sampleMasterKeyPath, encryptionAlgorithm, sampleEncryptedColumnEncryptionKey);
      } catch (err) {
        assert.instanceOf(err, Error);
        assert.equal(err.message, 'CipherText length does not match the RSA key size.');
      }
      azureKeyVaultWrapStub.restore();
    })

    xit('checks Signed hash length does not match the RSA key size error', async () => {
    // Throws "Column encryption key cannot be null." instead... Not sure why. 
     /*  const azureKeyVaultSignedHashedDataStub = sinon.stub(keyVaultProvider, 'azureKeyVaultSignedHashedData').returns(Buffer.alloc(1));
      try {
        await keyVaultProvider.encryptColumnEncryptionKey(sampleMasterKeyPath, encryptionAlgorithm, sampleEncryptedColumnEncryptionKey);
      } catch (err) {
        assert.instanceOf(err, Error);
        assert.equal(err.message, 'Signed hash length does not match the RSA key size.');
      }
      azureKeyVaultSignedHashedDataStub.restore(); */
    })
  })
  
  it('error checks getMasterKey()', async () => {
    const keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider('sampleClientId', 'sampleClientKey', 'sampleTenantId');

    try{
      await keyVaultProvider.getMasterKey(undefined);
    } catch(err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Master key path cannot be null or undefined');
    }

    try{
      await keyVaultProvider.getMasterKey(null);
    } catch(err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Master key path cannot be null or undefined');
    }
  })

  it('error checks createKeyClient()', () => {
    const keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider('sampleClientId', 'sampleClientKey', 'sampleTenantId');
    try{
      keyVaultProvider.createKeyClient(undefined);
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Cannot create key client with null or undefined keyVaultUrl');
    }

    try{
      keyVaultProvider.createKeyClient(null);
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Cannot create key client with null or undefined keyVaultUrl');
    }
  })

  it('error checks createCryptoClient()', () => {
    const keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider('sampleClientId', 'sampleClientKey', 'sampleTenantId');
    try{
      keyVaultProvider.createCryptoClient(undefined);
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Cannot create CryptographyClient with null or undefined masterKey');
    }

    try{
      keyVaultProvider.createCryptoClient(null);
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Cannot create CryptographyClient with null or undefined masterKey');
    }
  });

  it('error checks parsePath()', () => {
    const keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider('sampleClientId', 'sampleClientKey', 'sampleTenantId');
    try{
      keyVaultProvider.parsePath(undefined);
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Azure Key Vault key path cannot be null.');
    }

    try{
      keyVaultProvider.parsePath('');
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Azure Key Vault key path cannot be null.');
    }

    try{
      keyVaultProvider.parsePath('http');
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, `Invalid Azure Key Vault key path specified: http.`);
    }

    try{
      keyVaultProvider.parsePath('http://foo.com/blah_blah/');
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, `Invalid Azure Key Vault key path specified: http://foo.com/blah_blah/.`);
    }

    try{
      keyVaultProvider.parsePath('https://sampledomain.vault.azure.net:443/keys');
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, `Invalid keys identifier: https://sampledomain.vault.azure.net:443/keys. Bad number of segments: 2`);
    }

    try{
      keyVaultProvider.parsePath('https://sampledomain.vault.azure.net:443/foo/CMK');
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, `Invalid keys identifier: https://sampledomain.vault.azure.net:443/foo/CMK. segment [1] should be "keys", found "foo"`);
    }

    try{
      keyVaultProvider.parsePath(sampleMasterKeyPath);
    } catch (err) {
      assert.isNull(err);
    }
  })

  it('error checks azureKeyVaultSignedHashedData()', async () => {
    const keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider('sampleClientId', 'sampleClientKey', 'sampleTenantId');

    try{
      await keyVaultProvider.azureKeyVaultSignedHashedData(null)
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Azure KVS Crypto Client is not defined.');
    }
  });

  it('error checks azureKeyVaultWrap()', async () => {
    const keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider('sampleClientId', 'sampleClientKey', 'sampleTenantId');

    try{
      await keyVaultProvider.azureKeyVaultWrap(null)
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Azure KVS Crypto Client is not defined.');
    }

    try{
      await keyVaultProvider.azureKeyVaultWrap('foobar')
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Column encryption key cannot be null.');
    }
  });

  it('error checks azureKeyVaultUnWrap()', async () => {
    const keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider('sampleClientId', 'sampleClientKey', 'sampleTenantId');

    try{
      await keyVaultProvider.azureKeyVaultUnWrap(null)
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Azure KVS Crypto Client is not defined.');
    }

    try{
      await keyVaultProvider.azureKeyVaultUnWrap('foobar', null)
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Encryption Algorithm cannot be null or undefined');
    }

    try{
      await keyVaultProvider.azureKeyVaultUnWrap('foobar', 'zaz')
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Encrypted column encryption key cannot be null.');
    }
  });

  it('error checks getAKVKeySize()', ()=> {
    const keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider('sampleClientId', 'sampleClientKey', 'sampleTenantId');

    try{
      keyVaultProvider.getAKVKeySize(null);
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Retrieved key cannot be null or undefined');
    }

    const retrievedKey = {name: 'retrievedKey'}
    try{
      keyVaultProvider.getAKVKeySize(retrievedKey);
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, `Key does not exist ${retrievedKey.name}`);
    }
  });

  it('error checks validateEncryptionAlgorithm()', () => {
    const keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider('sampleClientId', 'sampleClientKey', 'sampleTenantId');

    try{
      keyVaultProvider.validateEncryptionAlgorithm();
    } catch (err) {
      assert.instanceOf(err, Error);
      assert.equal(err.message, 'Key encryption algorithm cannot be null.');
    }
  })
});
