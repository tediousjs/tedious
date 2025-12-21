const dataTypeByName = require('../../../src/data-type').typeByName;
const WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const StreamParser = require('../../../src/token/stream-parser');
const assert = require('chai').assert;

describe('Colmetadata Token Parser', () => {
  describe('parsing the column metadata for a result with many columns', function() {
    it('should parse them correctly', async function() {
      const userType = 2;
      const flags = 3;
      const columnName = 'name';

      const buffer = new WritableTrackingBuffer(50, 'ucs2');

      buffer.writeUInt8(0x81);
      // Column Count
      buffer.writeUInt16LE(1024);

      for (let i = 0; i < 1024; i++) {
        buffer.writeUInt32LE(userType);
        buffer.writeUInt16LE(flags);
        buffer.writeUInt8(dataTypeByName.Int.id);
        buffer.writeBVarchar(columnName);
      }

      const parser = StreamParser.parseTokens([buffer.data], {}, {});

      const result = await parser.next();
      assert.isFalse(result.done);
      const token = result.value;

      assert.isOk(!token.error);

      assert.strictEqual(token.columns.length, 1024);

      for (let i = 0; i < 1024; i++) {
        assert.strictEqual(token.columns[i].userType, 2);
        assert.strictEqual(token.columns[i].flags, 3);
        assert.strictEqual(token.columns[i].type.name, 'Int');
        assert.strictEqual(token.columns[i].colName, 'name');
      }

      assert.isTrue((await parser.next()).done);
    });
  });

  it('should int', async () => {
    const numberOfColumns = 1;
    const userType = 2;
    const flags = 3;
    const columnName = 'name';

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0x81);
    buffer.writeUInt16LE(numberOfColumns);
    buffer.writeUInt32LE(userType);
    buffer.writeUInt16LE(flags);
    buffer.writeUInt8(dataTypeByName.Int.id);
    buffer.writeBVarchar(columnName);
    // console.log(buffer.data)

    const parser = StreamParser.parseTokens([buffer.data], {}, {});

    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.isOk(!token.error);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].userType, 2);
    assert.strictEqual(token.columns[0].flags, 3);
    assert.strictEqual(token.columns[0].type.name, 'Int');
    assert.strictEqual(token.columns[0].colName, 'name');

    assert.isTrue((await parser.next()).done);
  });

  it('should varchar', async () => {
    const numberOfColumns = 1;
    const userType = 2;
    const flags = 3;
    const length = 3;
    const collation = Buffer.from([0x09, 0x04, 0x50, 0x78, 0x9a]);
    const columnName = 'name';

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0x81);
    buffer.writeUInt16LE(numberOfColumns);
    buffer.writeUInt32LE(userType);
    buffer.writeUInt16LE(flags);
    buffer.writeUInt8(dataTypeByName.VarChar.id);
    buffer.writeUInt16LE(length);
    buffer.writeBuffer(collation);
    buffer.writeBVarchar(columnName);
    // console.log(buffer)


    const parser = StreamParser.parseTokens([buffer.data], {}, {});
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    assert.isOk(!token.error);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].userType, 2);
    assert.strictEqual(token.columns[0].flags, 3);
    assert.strictEqual(token.columns[0].type.name, 'VarChar');
    assert.strictEqual(token.columns[0].collation.lcid, 0x0409);
    assert.strictEqual(token.columns[0].collation.codepage, 'CP1257');
    assert.strictEqual(token.columns[0].collation.flags, 0x85);
    assert.strictEqual(token.columns[0].collation.version, 0x7);
    assert.strictEqual(token.columns[0].collation.sortId, 0x9a);
    assert.strictEqual(token.columns[0].colName, 'name');
    assert.strictEqual(token.columns[0].dataLength, length);
  });

  describe('Always Encrypted', () => {
    const FLAG_ENCRYPTED = 0x0800;

    it('should parse empty CekTable when server supports column encryption', async () => {
      const buffer = new WritableTrackingBuffer(50, 'ucs2');

      buffer.writeUInt8(0x81); // COLMETADATA token
      buffer.writeUInt16LE(1); // Column count = 1 (comes before CekTable per MS-TDS spec)
      buffer.writeUInt16LE(0); // CekTable size = 0 (empty)

      // Column metadata (non-encrypted)
      buffer.writeUInt32LE(0); // userType
      buffer.writeUInt16LE(0); // flags (not encrypted)
      buffer.writeUInt8(dataTypeByName.Int.id);
      buffer.writeBVarchar('col1');

      const parser = StreamParser.parseTokens([buffer.data], {}, { serverSupportsColumnEncryption: true });
      const result = await parser.next();
      assert.isFalse(result.done);

      const token = result.value;
      assert.strictEqual(token.columns.length, 1);
      assert.strictEqual(token.columns[0].colName, 'col1');
      assert.strictEqual(token.columns[0].type.name, 'Int');
      assert.isUndefined(token.columns[0].cryptoMetadata);
    });

    it('should parse CekTable with one CEK entry', async () => {
      const buffer = new WritableTrackingBuffer(200, 'ucs2');

      buffer.writeUInt8(0x81); // COLMETADATA token

      // Column count (comes before CekTable per MS-TDS spec)
      buffer.writeUInt16LE(1);

      // CekTable
      buffer.writeUInt16LE(1); // CekTable size = 1

      // CEK Entry 0
      buffer.writeUInt32LE(1); // DatabaseId
      buffer.writeUInt32LE(2); // CekId
      buffer.writeUInt32LE(3); // CekVersion
      buffer.writeBuffer(Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])); // CekMdVersion (8 bytes)
      buffer.writeUInt8(1); // EkValueCount = 1

      // EncryptionKeyValue 0
      const encryptedKey = Buffer.from([0xAA, 0xBB, 0xCC, 0xDD]);
      buffer.writeUInt16LE(encryptedKey.length); // Encrypted key length
      buffer.writeBuffer(encryptedKey);
      buffer.writeBVarchar('AZURE_KEY_VAULT'); // KeyStoreName
      buffer.writeBVarchar('https://vault.azure.net/keys/mykey/version'); // KeyPath
      buffer.writeBVarchar('RSA_OAEP'); // AlgorithmName

      // Column metadata (encrypted)
      buffer.writeUInt32LE(0); // userType
      buffer.writeUInt16LE(FLAG_ENCRYPTED); // flags with encrypted bit set
      buffer.writeUInt8(dataTypeByName.VarBinary.id); // Encrypted columns appear as VarBinary
      buffer.writeUInt16LE(8000); // dataLength

      // CryptoMetadata
      buffer.writeUInt16LE(0); // Ordinal (index into CekTable)
      buffer.writeUInt32LE(0); // UserType for CryptoMetadata
      // BaseTypeInfo (TYPE_INFO structure parsed by readBaseMetadata)
      buffer.writeUInt32LE(0); // UserType for base type
      buffer.writeUInt16LE(0); // Flags for base type
      buffer.writeUInt8(dataTypeByName.Int.id); // Type number - actual type is Int
      // Int is fixed-size, no additional type data needed
      buffer.writeUInt8(2); // EncryptionAlgo = AEAD_AES_256_CBC_HMAC_SHA256
      buffer.writeUInt8(2); // EncryptionType = Randomized
      buffer.writeUInt8(1); // NormalizationVersion

      buffer.writeBVarchar('encrypted_col');

      const parser = StreamParser.parseTokens([buffer.data], {}, { serverSupportsColumnEncryption: true });
      const result = await parser.next();
      assert.isFalse(result.done);

      const token = result.value;
      assert.strictEqual(token.columns.length, 1);
      assert.strictEqual(token.columns[0].colName, 'encrypted_col');
      assert.strictEqual(token.columns[0].type.name, 'VarBinary');

      // Check cryptoMetadata
      const cryptoMetadata = token.columns[0].cryptoMetadata;
      assert.isDefined(cryptoMetadata);
      assert.strictEqual(cryptoMetadata.ordinal, 0);
      assert.strictEqual(cryptoMetadata.cipherAlgorithmId, 2); // AEAD_AES_256_CBC_HMAC_SHA256
      assert.strictEqual(cryptoMetadata.encryptionType, 2); // Randomized
      assert.strictEqual(cryptoMetadata.baseTypeInfo.type.name, 'Int');

      // Check CEK entry
      assert.isDefined(cryptoMetadata.cekEntry);
      assert.strictEqual(cryptoMetadata.cekEntry.databaseId, 1);
      assert.strictEqual(cryptoMetadata.cekEntry.cekId, 2);
      assert.strictEqual(cryptoMetadata.cekEntry.cekVersion, 3);
      assert.strictEqual(cryptoMetadata.cekEntry.columnEncryptionKeyValues.length, 1);
      assert.strictEqual(cryptoMetadata.cekEntry.columnEncryptionKeyValues[0].keyStoreName, 'AZURE_KEY_VAULT');
      assert.strictEqual(cryptoMetadata.cekEntry.columnEncryptionKeyValues[0].keyPath, 'https://vault.azure.net/keys/mykey/version');
      assert.strictEqual(cryptoMetadata.cekEntry.columnEncryptionKeyValues[0].algorithmName, 'RSA_OAEP');
    });

    it('should parse CekTable with multiple CEK entries and encrypted columns', async () => {
      const buffer = new WritableTrackingBuffer(400, 'ucs2');

      buffer.writeUInt8(0x81); // COLMETADATA token

      // Column count = 2 (comes before CekTable per MS-TDS spec)
      buffer.writeUInt16LE(2);

      // CekTable with 2 entries
      buffer.writeUInt16LE(2);

      // CEK Entry 0
      buffer.writeUInt32LE(1); // DatabaseId
      buffer.writeUInt32LE(10); // CekId
      buffer.writeUInt32LE(1); // CekVersion
      buffer.writeBuffer(Buffer.alloc(8, 0x01)); // CekMdVersion
      buffer.writeUInt8(1); // EkValueCount = 1
      buffer.writeUInt16LE(4);
      buffer.writeBuffer(Buffer.from([0x11, 0x22, 0x33, 0x44]));
      buffer.writeBVarchar('MSSQL_CERTIFICATE_STORE');
      buffer.writeBVarchar('CurrentUser/My/Cert1');
      buffer.writeBVarchar('RSA_OAEP');

      // CEK Entry 1
      buffer.writeUInt32LE(1); // DatabaseId
      buffer.writeUInt32LE(20); // CekId
      buffer.writeUInt32LE(1); // CekVersion
      buffer.writeBuffer(Buffer.alloc(8, 0x02)); // CekMdVersion
      buffer.writeUInt8(1); // EkValueCount = 1
      buffer.writeUInt16LE(4);
      buffer.writeBuffer(Buffer.from([0x55, 0x66, 0x77, 0x88]));
      buffer.writeBVarchar('AZURE_KEY_VAULT');
      buffer.writeBVarchar('https://vault.azure.net/keys/key2');
      buffer.writeBVarchar('RSA_OAEP');

      // Column 0 - encrypted with CEK 0
      buffer.writeUInt32LE(0);
      buffer.writeUInt16LE(FLAG_ENCRYPTED);
      buffer.writeUInt8(dataTypeByName.VarBinary.id);
      buffer.writeUInt16LE(8000);
      // CryptoMetadata
      buffer.writeUInt16LE(0); // Ordinal = 0
      buffer.writeUInt32LE(0); // UserType for CryptoMetadata
      buffer.writeUInt32LE(0); // UserType for base type
      buffer.writeUInt16LE(0); // Flags for base type
      buffer.writeUInt8(dataTypeByName.NVarChar.id);
      buffer.writeUInt16LE(100); // dataLength for NVarChar
      buffer.writeBuffer(Buffer.from([0x09, 0x04, 0x00, 0x00, 0x00])); // Collation
      buffer.writeUInt8(2); // AEAD_AES_256_CBC_HMAC_SHA256
      buffer.writeUInt8(1); // Deterministic
      buffer.writeUInt8(1);
      buffer.writeBVarchar('ssn');

      // Column 1 - encrypted with CEK 1
      buffer.writeUInt32LE(0);
      buffer.writeUInt16LE(FLAG_ENCRYPTED);
      buffer.writeUInt8(dataTypeByName.VarBinary.id);
      buffer.writeUInt16LE(8000);
      // CryptoMetadata
      buffer.writeUInt16LE(1); // Ordinal = 1
      buffer.writeUInt32LE(0); // UserType for CryptoMetadata
      buffer.writeUInt32LE(0); // UserType for base type
      buffer.writeUInt16LE(0); // Flags for base type
      buffer.writeUInt8(dataTypeByName.DateTime2.id);
      buffer.writeUInt8(7); // scale for DateTime2
      buffer.writeUInt8(2); // AEAD_AES_256_CBC_HMAC_SHA256
      buffer.writeUInt8(2); // Randomized
      buffer.writeUInt8(1);
      buffer.writeBVarchar('dob');

      const parser = StreamParser.parseTokens([buffer.data], {}, { serverSupportsColumnEncryption: true });
      const result = await parser.next();
      assert.isFalse(result.done);

      const token = result.value;
      assert.strictEqual(token.columns.length, 2);

      // First column
      assert.strictEqual(token.columns[0].colName, 'ssn');
      assert.strictEqual(token.columns[0].cryptoMetadata.ordinal, 0);
      assert.strictEqual(token.columns[0].cryptoMetadata.encryptionType, 1); // Deterministic
      assert.strictEqual(token.columns[0].cryptoMetadata.baseTypeInfo.type.name, 'NVarChar');
      assert.strictEqual(token.columns[0].cryptoMetadata.cekEntry.cekId, 10);

      // Second column
      assert.strictEqual(token.columns[1].colName, 'dob');
      assert.strictEqual(token.columns[1].cryptoMetadata.ordinal, 1);
      assert.strictEqual(token.columns[1].cryptoMetadata.encryptionType, 2); // Randomized
      assert.strictEqual(token.columns[1].cryptoMetadata.baseTypeInfo.type.name, 'DateTime2');
      assert.strictEqual(token.columns[1].cryptoMetadata.cekEntry.cekId, 20);
    });

    it('should parse custom encryption algorithm name when cipherAlgorithmId is 0', async () => {
      const buffer = new WritableTrackingBuffer(200, 'ucs2');

      buffer.writeUInt8(0x81); // COLMETADATA token

      // Column count (comes before CekTable per MS-TDS spec)
      buffer.writeUInt16LE(1);

      // CekTable
      buffer.writeUInt16LE(1);
      buffer.writeUInt32LE(1);
      buffer.writeUInt32LE(1);
      buffer.writeUInt32LE(1);
      buffer.writeBuffer(Buffer.alloc(8, 0x00));
      buffer.writeUInt8(1);
      buffer.writeUInt16LE(4);
      buffer.writeBuffer(Buffer.from([0x01, 0x02, 0x03, 0x04]));
      buffer.writeBVarchar('CUSTOM_STORE');
      buffer.writeBVarchar('/path/to/key');
      buffer.writeBVarchar('CUSTOM_ALGO');

      // Encrypted column
      buffer.writeUInt32LE(0);
      buffer.writeUInt16LE(FLAG_ENCRYPTED);
      buffer.writeUInt8(dataTypeByName.VarBinary.id);
      buffer.writeUInt16LE(8000);

      // CryptoMetadata with custom algorithm
      buffer.writeUInt16LE(0); // Ordinal
      buffer.writeUInt32LE(0); // UserType for CryptoMetadata
      buffer.writeUInt32LE(0); // UserType for base type
      buffer.writeUInt16LE(0); // Flags for base type
      buffer.writeUInt8(dataTypeByName.Int.id);
      buffer.writeUInt8(0); // Custom algorithm (0)
      buffer.writeBVarchar('MY_CUSTOM_CIPHER'); // Algorithm name only when cipherAlgorithmId = 0
      buffer.writeUInt8(1); // Deterministic
      buffer.writeUInt8(1);

      buffer.writeBVarchar('custom_col');

      const parser = StreamParser.parseTokens([buffer.data], {}, { serverSupportsColumnEncryption: true });
      const result = await parser.next();
      assert.isFalse(result.done);

      const token = result.value;
      assert.strictEqual(token.columns.length, 1);
      assert.strictEqual(token.columns[0].cryptoMetadata.cipherAlgorithmId, 0);
      assert.strictEqual(token.columns[0].cryptoMetadata.cipherAlgorithmName, 'MY_CUSTOM_CIPHER');
    });

    it('should not parse CekTable when server does not support column encryption', async () => {
      const buffer = new WritableTrackingBuffer(50, 'ucs2');

      buffer.writeUInt8(0x81); // COLMETADATA token
      buffer.writeUInt16LE(1); // Column count (no CekTable when server doesn't support AE)

      // Column metadata (non-encrypted)
      buffer.writeUInt32LE(0);
      buffer.writeUInt16LE(0);
      buffer.writeUInt8(dataTypeByName.Int.id);
      buffer.writeBVarchar('col1');

      const parser = StreamParser.parseTokens([buffer.data], {}, { serverSupportsColumnEncryption: false });
      const result = await parser.next();
      assert.isFalse(result.done);

      const token = result.value;
      assert.strictEqual(token.columns.length, 1);
      assert.strictEqual(token.columns[0].colName, 'col1');
      assert.isUndefined(token.columns[0].cryptoMetadata);
    });

    it('should parse mixed encrypted and non-encrypted columns', async () => {
      const buffer = new WritableTrackingBuffer(300, 'ucs2');

      buffer.writeUInt8(0x81); // COLMETADATA token

      // Column count = 3 (comes before CekTable per MS-TDS spec)
      buffer.writeUInt16LE(3);

      // CekTable with 1 entry
      buffer.writeUInt16LE(1);
      buffer.writeUInt32LE(1);
      buffer.writeUInt32LE(1);
      buffer.writeUInt32LE(1);
      buffer.writeBuffer(Buffer.alloc(8, 0x00));
      buffer.writeUInt8(1);
      buffer.writeUInt16LE(4);
      buffer.writeBuffer(Buffer.from([0x01, 0x02, 0x03, 0x04]));
      buffer.writeBVarchar('STORE');
      buffer.writeBVarchar('/key');
      buffer.writeBVarchar('RSA');

      // Column 0 - non-encrypted Int
      buffer.writeUInt32LE(0);
      buffer.writeUInt16LE(0); // No encryption flag
      buffer.writeUInt8(dataTypeByName.Int.id);
      buffer.writeBVarchar('id');

      // Column 1 - encrypted
      buffer.writeUInt32LE(0);
      buffer.writeUInt16LE(FLAG_ENCRYPTED);
      buffer.writeUInt8(dataTypeByName.VarBinary.id);
      buffer.writeUInt16LE(8000);
      // CryptoMetadata
      buffer.writeUInt16LE(0); // Ordinal
      buffer.writeUInt32LE(0); // UserType for CryptoMetadata
      buffer.writeUInt32LE(0); // UserType for base type
      buffer.writeUInt16LE(0); // Flags for base type
      buffer.writeUInt8(dataTypeByName.Int.id);
      buffer.writeUInt8(2); // AEAD_AES_256_CBC_HMAC_SHA256
      buffer.writeUInt8(2); // Randomized
      buffer.writeUInt8(1); // NormalizationVersion
      buffer.writeBVarchar('secret_value');

      // Column 2 - non-encrypted NVarChar
      buffer.writeUInt32LE(0);
      buffer.writeUInt16LE(0);
      buffer.writeUInt8(dataTypeByName.NVarChar.id);
      buffer.writeUInt16LE(100);
      buffer.writeBuffer(Buffer.from([0x09, 0x04, 0x00, 0x00, 0x00])); // Collation
      buffer.writeBVarchar('name');

      const parser = StreamParser.parseTokens([buffer.data], {}, { serverSupportsColumnEncryption: true });
      const result = await parser.next();
      assert.isFalse(result.done);

      const token = result.value;
      assert.strictEqual(token.columns.length, 3);

      // Column 0 - non-encrypted
      assert.strictEqual(token.columns[0].colName, 'id');
      assert.strictEqual(token.columns[0].type.name, 'Int');
      assert.isUndefined(token.columns[0].cryptoMetadata);

      // Column 1 - encrypted
      assert.strictEqual(token.columns[1].colName, 'secret_value');
      assert.strictEqual(token.columns[1].type.name, 'VarBinary');
      assert.isDefined(token.columns[1].cryptoMetadata);
      assert.strictEqual(token.columns[1].cryptoMetadata.baseTypeInfo.type.name, 'Int');

      // Column 2 - non-encrypted
      assert.strictEqual(token.columns[2].colName, 'name');
      assert.strictEqual(token.columns[2].type.name, 'NVarChar');
      assert.isUndefined(token.columns[2].cryptoMetadata);
    });
  });
});
