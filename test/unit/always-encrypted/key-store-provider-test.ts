import { assert } from 'chai';
import { constants, createHash, generateKeyPairSync, privateDecrypt, privateEncrypt, publicDecrypt, publicEncrypt, randomBytes, sign, verify, type KeyObject } from 'crypto';

import { type CryptographyClient } from '@azure/keyvault-keys';

import { AzureKeyVaultKeyStoreProvider, RsaKeyStoreProvider, type AzureKeyVaultCryptographyClient } from '../../../src/always-encrypted/key-store-provider';

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error: any) {
    return error;
  }

  assert.fail('Expected the promise to be rejected');
}

/**
 * Splits an encrypted column encryption key into the parts of its envelope.
 */
function parseEnvelope(encryptedKey: Buffer) {
  const keyPathLength = encryptedKey.readUInt16LE(1);
  const ciphertextLength = encryptedKey.readUInt16LE(3);

  return {
    version: encryptedKey[0],
    keyPath: encryptedKey.toString('utf16le', 5, 5 + keyPathLength),
    ciphertext: encryptedKey.subarray(5 + keyPathLength, 5 + keyPathLength + ciphertextLength),
    signature: encryptedKey.subarray(5 + keyPathLength + ciphertextLength),
    signedData: encryptedKey.subarray(0, 5 + keyPathLength + ciphertextLength)
  };
}

describe('key store providers', function() {
  const columnEncryptionKey = randomBytes(32);

  let privateKey: KeyObject;
  let publicKey: KeyObject;
  let otherPrivateKey: KeyObject;

  before(function() {
    ({ privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }));
    ({ privateKey: otherPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }));
  });

  describe('RsaKeyStoreProvider', function() {
    const keyPath = 'CurrentUser/My/F2260F28C9C2F67DE4D8B7F5F2F3A2C9A3F1B5D1';

    it('requires an object or function of keys', function() {
      for (const keys of [undefined, null, 'key', 42]) {
        assert.throws(() => {
          new RsaKeyStoreProvider(keys as any);
        }, TypeError, 'The "keys" argument must be of type object or function.');
      }
    });

    it('encrypts a column encryption key into the format of Microsoft\'s key store providers', async function() {
      const provider = new RsaKeyStoreProvider({ [keyPath]: privateKey });
      const encryptedKey = await provider.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey);

      const { version, keyPath: envelopeKeyPath, ciphertext, signature, signedData } = parseEnvelope(encryptedKey);

      assert.strictEqual(version, 0x01);
      assert.strictEqual(envelopeKeyPath, keyPath.toLowerCase());
      assert.lengthOf(ciphertext, 256);
      assert.lengthOf(signature, 256);

      assert.deepEqual(privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, ciphertext), columnEncryptionKey);
      assert.isTrue(verify('sha256', signedData, publicKey, signature));
    });

    it('decrypts a column encryption key', async function() {
      const provider = new RsaKeyStoreProvider({ [keyPath]: privateKey });
      const encryptedKey = await provider.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey);

      assert.deepEqual(await provider.decryptColumnEncryptionKey(keyPath, 'RSA_OAEP', encryptedKey), columnEncryptionKey);
    });

    it('decrypts a column encryption key that was encrypted elsewhere', async function() {
      // Built by hand, the way the other drivers do.
      const path = Buffer.from(keyPath.toLowerCase(), 'utf16le');
      const ciphertext = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, columnEncryptionKey);

      const header = Buffer.alloc(5);
      header.writeUInt8(0x01, 0);
      header.writeUInt16LE(path.length, 1);
      header.writeUInt16LE(ciphertext.length, 3);

      const signedData = Buffer.concat([header, path, ciphertext]);
      const encryptedKey = Buffer.concat([signedData, sign('sha256', signedData, privateKey)]);

      const provider = new RsaKeyStoreProvider({ [keyPath]: privateKey });
      assert.deepEqual(await provider.decryptColumnEncryptionKey(keyPath, 'RSA_OAEP', encryptedKey), columnEncryptionKey);
    });

    it('accepts keys in the formats `crypto.createPrivateKey` accepts', async function() {
      const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
      const der = privateKey.export({ type: 'pkcs8', format: 'der' });

      const encryptedKey = await new RsaKeyStoreProvider({ [keyPath]: privateKey }).encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey);

      for (const key of [pem, Buffer.from(pem), { key: der, format: 'der', type: 'pkcs8' } as const, privateKey.export({ format: 'jwk' }) && { key: privateKey.export({ format: 'jwk' }), format: 'jwk' } as const]) {
        const provider = new RsaKeyStoreProvider({ [keyPath]: key });
        assert.deepEqual(await provider.decryptColumnEncryptionKey(keyPath, 'RSA_OAEP', encryptedKey), columnEncryptionKey);
      }
    });

    it('matches the key paths of an object case-insensitively', async function() {
      const provider = new RsaKeyStoreProvider({ [keyPath.toUpperCase()]: privateKey });
      const encryptedKey = await provider.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey);

      assert.deepEqual(await provider.decryptColumnEncryptionKey(keyPath.toLowerCase(), 'rsa_oaep', encryptedKey), columnEncryptionKey);
    });

    it('looks up keys with a function, once per key path', async function() {
      const lookups: string[] = [];
      const provider = new RsaKeyStoreProvider(async (masterKeyPath) => {
        lookups.push(masterKeyPath);
        return masterKeyPath === keyPath ? privateKey.export({ type: 'pkcs8', format: 'pem' }) : undefined;
      });

      const encryptedKey = await provider.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey);
      assert.deepEqual(await provider.decryptColumnEncryptionKey(keyPath, 'RSA_OAEP', encryptedKey), columnEncryptionKey);
      assert.deepEqual(await provider.decryptColumnEncryptionKey(keyPath, 'RSA_OAEP', encryptedKey), columnEncryptionKey);

      assert.deepEqual(lookups, [keyPath]);
    });

    it('fails for a column master key it has no key for', async function() {
      const provider = new RsaKeyStoreProvider({ [keyPath]: privateKey });
      const encryptedKey = await provider.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey);

      const error = await rejection(provider.decryptColumnEncryptionKey('some/other/key', 'RSA_OAEP', encryptedKey));
      assert.strictEqual(error.message, 'No private key is available for the column master key "some/other/key".');
    });

    it('fails for keys that are not private RSA keys', async function() {
      const { privateKey: ecKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

      for (const key of [publicKey, ecKey]) {
        const provider = new RsaKeyStoreProvider({ [keyPath]: key });

        const error = await rejection(provider.decryptColumnEncryptionKey(keyPath, 'RSA_OAEP', Buffer.alloc(600)));
        assert.strictEqual(error.message, `The key of the column master key "${keyPath}" is not a private RSA key.`);
      }
    });

    it('fails for unsupported key encryption algorithms', async function() {
      const provider = new RsaKeyStoreProvider({ [keyPath]: privateKey });
      const encryptedKey = await provider.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey);

      for (const algorithm of ['RSA_OAEP_256', '', undefined as any]) {
        const message = `Unsupported column encryption key encryption algorithm "${algorithm}", only "RSA_OAEP" is supported.`;

        assert.strictEqual((await rejection(provider.decryptColumnEncryptionKey(keyPath, algorithm, encryptedKey))).message, message);
        assert.strictEqual((await rejection(provider.encryptColumnEncryptionKey(keyPath, algorithm, columnEncryptionKey))).message, message);
      }
    });

    it('fails if the signature does not match', async function() {
      const provider = new RsaKeyStoreProvider({ [keyPath]: privateKey, other: otherPrivateKey });
      const encryptedKey = await provider.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey);

      // Tampered ciphertext, tampered key path and tampered signature
      for (const offset of [5 + keyPath.length * 2 + 10, 7, encryptedKey.length - 1]) {
        const tampered = Buffer.from(encryptedKey);
        tampered[offset] ^= 0x01;

        const error = await rejection(provider.decryptColumnEncryptionKey(keyPath, 'RSA_OAEP', tampered));
        assert.match(error.message, /^The signature of the encrypted column encryption key does not match the column master key/);
      }

      // Signed by another column master key
      const error = await rejection(provider.decryptColumnEncryptionKey('other', 'RSA_OAEP', encryptedKey));
      assert.match(error.message, /^The signature of the encrypted column encryption key does not match the column master key "other"/);
    });

    it('fails for malformed encrypted column encryption keys', async function() {
      const provider = new RsaKeyStoreProvider({ [keyPath]: privateKey });
      const encryptedKey = await provider.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey);

      const wrongVersion = Buffer.from(encryptedKey);
      wrongVersion[0] = 0x02;

      for (const [value, message] of [
        [Buffer.alloc(0), 'The encrypted column encryption key is too short.'],
        [encryptedKey.subarray(0, 4), 'The encrypted column encryption key is too short.'],
        [wrongVersion, 'The encrypted column encryption key has an unsupported version 0x02.'],
        [encryptedKey.subarray(0, 100), 'The encrypted column encryption key is malformed.'],
        [encryptedKey.subarray(0, encryptedKey.length - 256), 'The encrypted column encryption key is malformed.']
      ] as const) {
        assert.strictEqual((await rejection(provider.decryptColumnEncryptionKey(keyPath, 'RSA_OAEP', value))).message, message);
      }
    });
  });

  describe('AzureKeyVaultKeyStoreProvider', function() {
    const keyPath = 'https://tedious.vault.azure.net/keys/cmk/4db8ad63b326494da1134ab274588805';

    // A key vault that holds a single key.
    class FakeCryptographyClient implements AzureKeyVaultCryptographyClient {
      calls: string[] = [];

      constructor(readonly keyId: string, private key = privateKey) {}

      async unwrapKey(algorithm: string, encryptedKey: Uint8Array) {
        this.calls.push(`unwrapKey ${algorithm}`);
        return { result: new Uint8Array(privateDecrypt({ key: this.key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, encryptedKey)) };
      }

      async wrapKey(algorithm: string, key: Uint8Array) {
        this.calls.push(`wrapKey ${algorithm}`);
        return { result: new Uint8Array(publicEncrypt({ key: this.key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, key)) };
      }

      // Key vault signs and verifies digests, not the data itself: the
      // digest is what the RSA private key operation is applied to.
      async sign(algorithm: string, digest: Uint8Array) {
        this.calls.push(`sign ${algorithm}`);
        return { result: new Uint8Array(privateEncrypt({ key: this.key, padding: constants.RSA_PKCS1_PADDING }, digestInfo(digest))) };
      }

      async verify(algorithm: string, digest: Uint8Array, signature: Uint8Array) {
        this.calls.push(`verify ${algorithm}`);

        try {
          return { result: publicDecrypt({ key: this.key, padding: constants.RSA_PKCS1_PADDING }, signature).equals(digestInfo(digest)) };
        } catch {
          return { result: false };
        }
      }
    }

    // The DER encoded `DigestInfo` of a SHA-256 digest.
    function digestInfo(digest: Uint8Array) {
      return Buffer.concat([Buffer.from('3031300d060960864801650304020105000420', 'hex'), digest]);
    }

    it('requires a function that creates cryptography clients', function() {
      assert.throws(() => {
        new AzureKeyVaultKeyStoreProvider(undefined as any);
      }, TypeError, 'The "createCryptographyClient" argument must be of type function.');
    });

    it('requires the trusted endpoints to be domain names', function() {
      for (const trustedEndpoints of ['vault.azure.net', [42], ['']]) {
        assert.throws(() => {
          new AzureKeyVaultKeyStoreProvider((keyId) => new FakeCryptographyClient(keyId), { trustedEndpoints: trustedEndpoints as any });
        }, TypeError, 'The "options.trustedEndpoints" property must be an array of domain names.');
      }
    });

    it('accepts the cryptography client of `@azure/keyvault-keys`', function() {
      // Verified by the type checker: the client matches what the provider
      // makes use of.
      const createCryptographyClient = (keyId: string): CryptographyClient => {
        throw new Error(`not connecting to ${keyId}`);
      };

      assert.instanceOf(new AzureKeyVaultKeyStoreProvider(createCryptographyClient), AzureKeyVaultKeyStoreProvider);
    });

    it('encrypts and decrypts a column encryption key', async function() {
      const clients: FakeCryptographyClient[] = [];
      const provider = new AzureKeyVaultKeyStoreProvider((keyId) => {
        const client = new FakeCryptographyClient(keyId);
        clients.push(client);
        return client;
      });

      const encryptedKey = await provider.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey);
      const decryptedKey = await provider.decryptColumnEncryptionKey(keyPath, 'RSA_OAEP', encryptedKey);

      assert.isTrue(Buffer.isBuffer(decryptedKey));
      assert.deepEqual(decryptedKey, columnEncryptionKey);

      // The client of a key is created once.
      assert.lengthOf(clients, 1);
      assert.strictEqual(clients[0].keyId, keyPath);
      assert.deepEqual(clients[0].calls, ['wrapKey RSA-OAEP', 'sign RS256', 'verify RS256', 'unwrapKey RSA-OAEP']);
    });

    it('uses the same format as the other key store providers', async function() {
      const azure = new AzureKeyVaultKeyStoreProvider((keyId) => new FakeCryptographyClient(keyId));
      const rsa = new RsaKeyStoreProvider({ [keyPath]: privateKey });

      assert.deepEqual(await rsa.decryptColumnEncryptionKey(keyPath, 'RSA_OAEP', await azure.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey)), columnEncryptionKey);
      assert.deepEqual(await azure.decryptColumnEncryptionKey(keyPath, 'RSA_OAEP', await rsa.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey)), columnEncryptionKey);
    });

    it('verifies the signature over the hash of the envelope', async function() {
      // A column encryption key that was encrypted by Microsoft's tools.
      const encryptedKey = Buffer.from('01BE000001680074007400700073003A002F002F0061007A007500720065002D00730071006C002D00610065002D0074006500730074002D006B0076002E007600610075006C0074002E0061007A007500720065002E006E00650074003A003400340033002F006B006500790073002F0063006D006B006100750074006F0032002F00340064006200380061006400360033006200330032003600340039003400640061003100310033003400610062003200370034003500380038003800300035007D39D366755743E1C5D15E3352B227C95625BE33B8F9E3AE891220D9B9AB637A48E28A3A35CC5A71DBFDD6FE71F7397DC054B56F021FD380CD046EE809A1FDEAFE631FBA4F32F69AE7660E3839537EB01788563B5C6FFB2CFF9D376D742B45065A9FA4DEADF359A79082F56F1B07228F7F47004174F4FAC4EA85BC5DEA4F10882B89FAB46A8C074D606C430FBBC4607FC725480FFB5FCA6717499B8D9663C3008880968D8DFB1E2415B678D5168FA30DAE510C7DAC7CCE843826F06499623B82439C59E17AFCAF00F8E8AA7F9F9790238048D3659B952B237D8E6E7DA706701E5205E5DC7846D4DCC7AA2011C60F64142D78DAB59B49AEA0229B73167CE59216ADEC632F739F9341BDB70574CC533CEC3FF0AC4EF05FF41FF437B935520BF4A629DDE0F5AADD24D6104007AAE2FD6DC865F54E702812E3A9A118E71DE36D809D4E014F5842549B9569DBDA899FB54BDEAF8943E44272AC8C278C0B14EC68F3C34BDFD54B5C6B8B94E12BDA2F67ED7C4CF45A6A62329267415DF16572C7723EF40A8512B083EA55D328377BA23A3C4E9572D6A802C0D57526C89937F16E61CF53BFA4A925FF090D9EACBA08DCEF1A5373FACC04F34C76AFCBA1A1E27A2E8DF9F4AB8D8B29B4133FB53253A9FB9C7192639FF0E50951AD53BDA29840A8B2D8740057384A3211488993C7DCC93E1392E88C9F663DB38A08781C6648FCD52F4531BF', 'hex');
      const masterKeyPath = 'https://azure-sql-ae-test-kv.vault.azure.net:443/keys/cmkauto2/4db8ad63b326494da1134ab274588805';

      const { keyPath: envelopeKeyPath, ciphertext, signature, signedData } = parseEnvelope(encryptedKey);
      assert.strictEqual(envelopeKeyPath, masterKeyPath);
      assert.lengthOf(ciphertext, 256);
      assert.lengthOf(signature, 256);

      const calls: unknown[][] = [];
      const provider = new AzureKeyVaultKeyStoreProvider(() => {
        return {
          async verify(...args) {
            calls.push(['verify', ...args]);
            return { result: true };
          },
          async unwrapKey(...args) {
            calls.push(['unwrapKey', ...args]);
            return { result: columnEncryptionKey };
          }
        };
      });

      assert.deepEqual(await provider.decryptColumnEncryptionKey(masterKeyPath, 'RSA_OAEP', encryptedKey), columnEncryptionKey);
      assert.deepEqual(calls, [
        ['verify', 'RS256', createHash('sha256').update(signedData).digest(), signature],
        ['unwrapKey', 'RSA-OAEP', ciphertext]
      ]);
    });

    it('fails if the signature does not match, without decrypting the key', async function() {
      const client = new FakeCryptographyClient(keyPath, otherPrivateKey);
      const provider = new AzureKeyVaultKeyStoreProvider(() => client);

      const encryptedKey = await new RsaKeyStoreProvider({ [keyPath]: privateKey }).encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey);

      const error = await rejection(provider.decryptColumnEncryptionKey(keyPath, 'RSA_OAEP', encryptedKey));
      assert.match(error.message, /^The signature of the encrypted column encryption key does not match the column master key/);
      assert.deepEqual(client.calls, ['verify RS256']);
    });

    it('fails for unsupported key encryption algorithms', async function() {
      const provider = new AzureKeyVaultKeyStoreProvider((keyId) => new FakeCryptographyClient(keyId));

      const error = await rejection(provider.decryptColumnEncryptionKey(keyPath, 'RSA_OAEP_256', Buffer.alloc(600)));
      assert.strictEqual(error.message, 'Unsupported column encryption key encryption algorithm "RSA_OAEP_256", only "RSA_OAEP" is supported.');
    });

    it('fails to encrypt with a client that can not wrap keys and sign', async function() {
      const provider = new AzureKeyVaultKeyStoreProvider(() => {
        return {
          unwrapKey: async () => ({ result: columnEncryptionKey }),
          verify: async () => ({ result: true })
        };
      });

      const error = await rejection(provider.encryptColumnEncryptionKey(keyPath, 'RSA_OAEP', columnEncryptionKey));
      assert.strictEqual(error.message, 'The cryptography client needs to support `wrapKey` and `sign` to encrypt column encryption keys.');
    });

    describe('trusted endpoints', function() {
      function providerWith(trustedEndpoints?: string[]) {
        const keyIds: string[] = [];
        const provider = new AzureKeyVaultKeyStoreProvider((keyId) => {
          keyIds.push(keyId);
          return new FakeCryptographyClient(keyId);
        }, trustedEndpoints && { trustedEndpoints });

        return { provider, keyIds };
      }

      it('only creates clients for keys at trusted endpoints', async function() {
        const { provider, keyIds } = providerWith();

        const trusted = [
          'https://tedious.vault.azure.net/keys/cmk/1',
          'https://TEDIOUS.VAULT.AZURE.NET:443/keys/cmk/1',
          'https://tedious.vault.azure.cn/keys/cmk/1',
          'https://tedious.vault.usgovcloudapi.net/keys/cmk/1',
          'https://tedious.vault.microsoftazure.de/keys/cmk/1',
          'https://tedious.managedhsm.azure.net/keys/cmk/1'
        ];

        for (const masterKeyPath of trusted) {
          const encryptedKey = await provider.encryptColumnEncryptionKey(masterKeyPath, 'RSA_OAEP', columnEncryptionKey);
          assert.deepEqual(await provider.decryptColumnEncryptionKey(masterKeyPath, 'RSA_OAEP', encryptedKey), columnEncryptionKey);
        }

        assert.deepEqual(keyIds, trusted);
      });

      it('rejects keys at other endpoints, without creating a client', async function() {
        const { provider, keyIds } = providerWith();

        for (const masterKeyPath of [
          'https://attacker.example.com/keys/cmk/1',
          'https://vault.azure.net.example.com/keys/cmk/1',
          'https://examplevault.azure.net/keys/cmk/1',
          'https://tedious.vault.azure.net@example.com/keys/cmk/1',
          'https://example.com/tedious.vault.azure.net/keys/cmk/1',
          'http://tedious.vault.azure.net/keys/cmk/1'
        ]) {
          const error = await rejection(provider.decryptColumnEncryptionKey(masterKeyPath, 'RSA_OAEP', Buffer.alloc(600)));
          assert.match(error.message, /does not refer to a trusted Azure Key Vault endpoint/, masterKeyPath);
        }

        for (const masterKeyPath of ['CurrentUser/My/F2260F28', '']) {
          const error = await rejection(provider.decryptColumnEncryptionKey(masterKeyPath, 'RSA_OAEP', Buffer.alloc(600)));
          assert.match(error.message, /is not a valid Azure Key Vault key identifier/, masterKeyPath);
        }

        assert.deepEqual(keyIds, []);
      });

      it('can be configured', async function() {
        const { provider, keyIds } = providerWith(['.Vault.Example.com']);

        await provider.encryptColumnEncryptionKey('https://tedious.vault.example.com/keys/cmk/1', 'RSA_OAEP', columnEncryptionKey);
        assert.deepEqual(keyIds, ['https://tedious.vault.example.com/keys/cmk/1']);

        const error = await rejection(provider.encryptColumnEncryptionKey('https://tedious.vault.azure.net/keys/cmk/1', 'RSA_OAEP', columnEncryptionKey));
        assert.match(error.message, /does not refer to a trusted Azure Key Vault endpoint. Trusted endpoints are: vault.example.com\.$/);
      });
    });
  });
});
