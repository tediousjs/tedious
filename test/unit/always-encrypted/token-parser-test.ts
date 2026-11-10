import { assert } from 'chai';
import { randomBytes } from 'crypto';

import { ColumnEncryptionCipher } from '../../../src/always-encrypted/cipher';
import { validateColumnEncryptionOptions } from '../../../src/always-encrypted/options';
import Connection from '../../../src/connection';
import Debug from '../../../src/debug';
import { RequestError } from '../../../src/errors';
import Request from '../../../src/request';
import { RequestTokenHandler, TokenHandler } from '../../../src/token/handler';
import StreamParser, { type ParserOptions } from '../../../src/token/stream-parser';
import { Parser as TokenStreamParser } from '../../../src/token/token-stream-parser';
import { ColMetadataToken, NBCRowToken, ReturnValueToken, RowToken, type DoneToken, type Token } from '../../../src/token/token';
import { type Column } from '../../../src/token/row-token-parser';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';

const FLAG_NULLABLE = 0x0001;
const FLAG_ENCRYPTED = 0x0800;

const columnEncryptionKey = Buffer.from('ED6FBC93EECDE0BFC6494FFB2EDB7998B7E94EF71FEDE584741A855238F0155E', 'hex');
const cipher = new ColumnEncryptionCipher(columnEncryptionKey);

// A key store whose "encrypted" column encryption keys are the keys
// themselves.
const columnEncryption = validateColumnEncryptionOptions({
  keyStoreProviders: {
    TEST: { decryptColumnEncryptionKey: (masterKeyPath, encryptionAlgorithm, encryptedKey) => encryptedKey }
  },
  keyCacheTTL: 0
});

const options: ParserOptions = {
  tdsVersion: '7_4',
  useUTC: true,
  lowerCaseGuids: false,
  useColumnNames: false,
  columnNameReplacer: undefined,
  camelCaseColumns: false,
  serverSupportsColumnEncryption: true,
  columnEncryption
};

// SQL_Latin1_General_CP1_CI_AS
const COLLATION = '0904d00034';

interface KeyValue {
  encryptedKey: Buffer;
  keyStoreName: string;
  keyPath: string;
  algorithm: string;
}

interface ColumnDefinition {
  name: string;

  /**
   * The `TYPE_INFO` of the column, as hex. For an encrypted column, that of
   * its decrypted values.
   */
  typeInfo: string;

  /**
   * Set for encrypted columns.
   */
  encrypted?: {
    keyOrdinal?: number | undefined;
    encryptionType?: number;
    algorithmId?: number;
    algorithmName?: string;
    normalizationRuleVersion?: number;

    /**
     * The `TYPE_INFO` of the encrypted values, `varbinary(8000)` by default.
     */
    typeInfo?: string;
  };
}

const VARBINARY_8000 = 'a5401f';
const VARBINARY_MAX = 'a5ffff';

// Normalized values, as hex:
//
// 2020-02-29, as the number of days since 0001-01-01
const DATE = 'cb400b';
// 12:34:56.1234567, as the number of 100 nanosecond intervals since midnight
const TIME = '87ee977669';
// 2020-02-29 12:34:56.123, as the number of days since 1900-01-01 and of
// 300ths of a second since midnight
const DATETIME = '70ab00006559cf00';
// 2020-02-29 12:34, as the number of days since 1900-01-01 and of minutes
// since midnight
const SMALLDATETIME = '70abf202';

function writeCryptoMetadata(buffer: WritableTrackingBuffer, column: ColumnDefinition, withOrdinal: boolean) {
  const { keyOrdinal = 0, encryptionType = 1, algorithmId = 2, algorithmName, normalizationRuleVersion = 1 } = column.encrypted!;

  if (withOrdinal) {
    buffer.writeUInt16LE(keyOrdinal);
  }

  buffer.writeUInt32LE(0); // user type
  buffer.writeBuffer(Buffer.from(column.typeInfo, 'hex'));
  buffer.writeUInt8(algorithmId);
  if (algorithmName !== undefined) {
    buffer.writeBVarchar(algorithmName, 'ucs2');
  }
  buffer.writeUInt8(encryptionType);
  buffer.writeUInt8(normalizationRuleVersion);
}

function colMetadata(keys: KeyValue[][], columns: ColumnDefinition[]): Buffer {
  const buffer = new WritableTrackingBuffer();
  buffer.writeUInt8(0x81);
  buffer.writeUInt16LE(columns.length);

  // The table of column encryption keys
  buffer.writeUInt16LE(keys.length);
  keys.forEach((values, index) => {
    buffer.writeUInt32LE(5); // database id
    buffer.writeUInt32LE(100 + index); // key id
    buffer.writeUInt32LE(1); // key version
    buffer.writeBuffer(Buffer.from('1122334455667788', 'hex')); // key metadata version

    buffer.writeUInt8(values.length);
    for (const { encryptedKey, keyStoreName, keyPath, algorithm } of values) {
      buffer.writeUInt16LE(encryptedKey.length);
      buffer.writeBuffer(encryptedKey);
      buffer.writeBVarchar(keyStoreName, 'ucs2');
      buffer.writeUsVarchar(keyPath, 'ucs2');
      buffer.writeBVarchar(algorithm, 'ucs2');
    }
  });

  for (const column of columns) {
    buffer.writeUInt32LE(0); // user type

    if (column.encrypted === undefined) {
      buffer.writeUInt16LE(FLAG_NULLABLE);
      buffer.writeBuffer(Buffer.from(column.typeInfo, 'hex'));
    } else {
      buffer.writeUInt16LE(FLAG_NULLABLE | FLAG_ENCRYPTED);
      buffer.writeBuffer(Buffer.from(column.encrypted.typeInfo ?? VARBINARY_8000, 'hex'));
      writeCryptoMetadata(buffer, column, true);
    }

    buffer.writeBVarchar(column.name, 'ucs2');
  }

  return buffer.data;
}

/**
 * A `varbinary` value: an encrypted value, as it is sent.
 */
function varbinary(value: Buffer | null): Buffer {
  const buffer = new WritableTrackingBuffer();

  if (value === null) {
    buffer.writeUInt16LE(0xFFFF);
  } else {
    buffer.writeUInt16LE(value.length);
    buffer.writeBuffer(value);
  }

  return buffer.data;
}

/**
 * A `varbinary(max)` value, sent in chunks of at most `chunkLength` bytes.
 */
function plp(value: Buffer | null, chunkLength = 100): Buffer {
  const buffer = new WritableTrackingBuffer();

  if (value === null) {
    buffer.writeBuffer(Buffer.alloc(8, 0xFF));
    return buffer.data;
  }

  buffer.writeBigUInt64LE(BigInt(value.length));
  for (let offset = 0; offset < value.length; offset += chunkLength) {
    const chunk = value.subarray(offset, offset + chunkLength);
    buffer.writeUInt32LE(chunk.length);
    buffer.writeBuffer(chunk);
  }
  buffer.writeUInt32LE(0);

  return buffer.data;
}

function encrypt(normalized: string, deterministic = true): Buffer {
  return cipher.encrypt(Buffer.from(normalized, 'hex'), deterministic);
}

function row(...values: Buffer[]): Buffer {
  return Buffer.concat([Buffer.from([0xD1]), ...values]);
}

function parse(data: Buffer | Buffer[], parserOptions = options): { parser: StreamParser, tokens: Token[] } {
  const parser = new StreamParser(parserOptions);
  const tokens = parseMore(parser, data);
  return { parser, tokens };
}

function parseMore(parser: StreamParser, data: Buffer | Buffer[]): Token[] {
  const tokens: Token[] = [];

  for (const chunk of Array.isArray(data) ? data : [data]) {
    parser.write(chunk);

    let token;
    while ((token = parser.read()) !== undefined) {
      tokens.push(token);
    }
  }

  return tokens;
}

function singleBytes(data: Buffer): Buffer[] {
  return Array.from(data, (byte) => Buffer.from([byte]));
}

function values(token: Token): unknown[] {
  assert.isTrue(token instanceof RowToken || token instanceof NBCRowToken);
  return ((token as RowToken).columns as Column[]).map((column) => column.value);
}

const key: KeyValue = { encryptedKey: columnEncryptionKey, keyStoreName: 'TEST', keyPath: 'key/1', algorithm: 'RSA_OAEP' };

describe('parsing tokens with column encryption', function() {
  describe('COLMETADATA', function() {
    const rotatedKey: KeyValue = { encryptedKey: randomBytes(600), keyStoreName: 'AZURE_KEY_VAULT', keyPath: 'https://tedious.vault.azure.net/keys/cmk/' + 'x'.repeat(300), algorithm: 'RSA_OAEP' };

    const data = colMetadata([[key, rotatedKey], [rotatedKey]], [
      { name: 'id', typeInfo: '38' }, // int
      { name: 'ssn', typeInfo: 'af0b00' + COLLATION, encrypted: { keyOrdinal: 0, encryptionType: 1 } }, // char(11)
      { name: 'salary', typeInfo: '6e08', encrypted: { keyOrdinal: 1, encryptionType: 2 } }, // money
      { name: 'notes', typeInfo: 'e7ffff' + COLLATION, encrypted: { keyOrdinal: 0, encryptionType: 2, typeInfo: VARBINARY_MAX } } // nvarchar(max)
    ]);

    function assertToken(token: Token) {
      assert.instanceOf(token, ColMetadataToken);
      const { columns, columnEncryptionKeys } = token as ColMetadataToken;

      assert.deepEqual(columnEncryptionKeys, [
        { databaseId: 5, keyId: 100, keyVersion: 1, metadataVersion: Buffer.from('1122334455667788', 'hex'), values: [key, rotatedKey], cipher: undefined },
        { databaseId: 5, keyId: 101, keyVersion: 1, metadataVersion: Buffer.from('1122334455667788', 'hex'), values: [rotatedKey], cipher: undefined }
      ]);

      assert.deepEqual(columns.map((column) => column.colName), ['id', 'ssn', 'salary', 'notes']);

      // Encrypted columns are described by the type of their decrypted values.
      assert.deepEqual(columns.map((column) => column.type.name), ['Int', 'Char', 'MoneyN', 'NVarChar']);
      assert.deepEqual(columns.map((column) => column.dataLength), [undefined, 11, 8, 0xFFFF]);
      assert.strictEqual(columns[1].collation!.codepage, 'CP1252');
      assert.deepEqual(columns.map((column) => column.flags & FLAG_ENCRYPTED), [0, FLAG_ENCRYPTED, FLAG_ENCRYPTED, FLAG_ENCRYPTED]);

      assert.isUndefined(columns[0].cryptoMetadata);
      assert.deepEqual(columns[1].cryptoMetadata, { key: columnEncryptionKeys![0], encryptionType: 'deterministic', algorithmId: 2, algorithmName: undefined, normalizationRuleVersion: 1, isPLP: false });
      assert.deepEqual(columns[2].cryptoMetadata, { key: columnEncryptionKeys![1], encryptionType: 'randomized', algorithmId: 2, algorithmName: undefined, normalizationRuleVersion: 1, isPLP: false });
      assert.deepEqual(columns[3].cryptoMetadata, { key: columnEncryptionKeys![0], encryptionType: 'randomized', algorithmId: 2, algorithmName: undefined, normalizationRuleVersion: 1, isPLP: true });

      // The keys refer to the very objects that the keys are loaded into.
      assert.strictEqual(columns[1].cryptoMetadata!.key, columnEncryptionKeys![0]);
    }

    it('parses the column encryption keys and the encryption metadata of columns', function() {
      const { tokens } = parse(data);

      assert.lengthOf(tokens, 1);
      assertToken(tokens[0]);
    });

    it('parses a token that arrives in single byte chunks', function() {
      const { parser, tokens } = parse(singleBytes(data));

      assert.lengthOf(tokens, 1);
      assertToken(tokens[0]);
      parser.end();
    });

    it('does not keep the incoming data alive through the encrypted keys', function() {
      const { tokens: [token] } = parse(data);
      const { values: [{ encryptedKey }] } = (token as ColMetadataToken).columnEncryptionKeys![0];

      assert.notStrictEqual(encryptedKey.buffer, data.buffer);
    });

    it('describes encrypted columns as they are sent if column encryption is disabled', function() {
      const { tokens: [token] } = parse(data, { ...options, columnEncryption: undefined });
      const { columns, columnEncryptionKeys } = token as ColMetadataToken;

      assert.isUndefined(columnEncryptionKeys);
      assert.deepEqual(columns.map((column) => column.colName), ['id', 'ssn', 'salary', 'notes']);
      assert.deepEqual(columns.map((column) => column.type.name), ['Int', 'VarBinary', 'VarBinary', 'VarBinary']);
      assert.deepEqual(columns.map((column) => column.dataLength), [undefined, 8000, 8000, 0xFFFF]);
      assert.deepEqual(columns.map((column) => column.cryptoMetadata), [undefined, undefined, undefined, undefined]);
    });

    it('has no column encryption keys for a result set without encrypted columns', function() {
      const { tokens: [token] } = parse(colMetadata([], [{ name: 'id', typeInfo: '38' }]));

      assert.isUndefined((token as ColMetadataToken).columnEncryptionKeys);
      assert.isUndefined((token as ColMetadataToken).columns[0].cryptoMetadata);
    });

    it('expects no column encryption keys if column encryption was not negotiated', function() {
      const buffer = new WritableTrackingBuffer();
      buffer.writeUInt8(0x81);
      buffer.writeUInt16LE(1);
      buffer.writeUInt32LE(0);
      // A server does not flag columns as encrypted in this case - if it
      // does anyway, no encryption metadata follows.
      buffer.writeUInt16LE(FLAG_NULLABLE | FLAG_ENCRYPTED);
      buffer.writeBuffer(Buffer.from(VARBINARY_8000, 'hex'));
      buffer.writeBVarchar('ssn', 'ucs2');

      const { serverSupportsColumnEncryption, ...unspecified } = options;
      assert.isTrue(serverSupportsColumnEncryption);

      for (const parserOptions of [{ ...options, serverSupportsColumnEncryption: false }, unspecified]) {
        const { tokens: [token] } = parse(buffer.data, parserOptions);
        const { columns, columnEncryptionKeys } = token as ColMetadataToken;

        assert.isUndefined(columnEncryptionKeys);
        assert.strictEqual(columns[0].type.name, 'VarBinary');
        assert.strictEqual(columns[0].colName, 'ssn');
        assert.isUndefined(columns[0].cryptoMetadata);
      }
    });

    it('parses the name of a custom encryption algorithm', function() {
      const { tokens: [token] } = parse(colMetadata([[key]], [
        { name: 'custom', typeInfo: '38', encrypted: { algorithmId: 0, algorithmName: 'CUSTOM_ALGORITHM' } }
      ]));

      const { cryptoMetadata } = (token as ColMetadataToken).columns[0];
      assert.strictEqual(cryptoMetadata!.algorithmId, 0);
      assert.strictEqual(cryptoMetadata!.algorithmName, 'CUSTOM_ALGORITHM');
    });

    it('fails for a column that refers to a column encryption key that was not sent', function() {
      assert.throws(() => {
        parse(colMetadata([[key]], [{ name: 'ssn', typeInfo: '38', encrypted: { keyOrdinal: 1 } }]));
      }, 'Unknown column encryption key ordinal 1');
    });

    it('fails for an unknown encryption type', function() {
      assert.throws(() => {
        parse(colMetadata([[key]], [{ name: 'ssn', typeInfo: '38', encrypted: { encryptionType: 3 } }]));
      }, 'Unsupported column encryption type 3');
    });

    it('fails for encrypted values that are not sent as binary values', function() {
      assert.throws(() => {
        parse(colMetadata([[key]], [{ name: 'ssn', typeInfo: '38', encrypted: { typeInfo: '38' } }]));
      }, 'Unexpected type Int of an encrypted value');
    });
  });

  describe('ROW', function() {
    /**
     * Parses a row of a single encrypted column of the given type.
     */
    function decrypt(typeInfo: string, value: Buffer | null, parserOptions = options): unknown {
      const { parser, tokens: [metadata] } = parse(colMetadata([[key]], [{ name: 'value', typeInfo, encrypted: {} }]), parserOptions);
      (metadata as ColMetadataToken).columnEncryptionKeys![0].cipher = cipher;

      const [token] = parseMore(parser, row(varbinary(value)));

      const { error } = (metadata as ColMetadataToken).columnEncryptionKeys![0];
      if (error !== undefined) {
        throw error;
      }

      return values(token)[0];
    }

    function decryptNormalized(typeInfo: string, normalized: string, parserOptions = options): unknown {
      return decrypt(typeInfo, encrypt(normalized), parserOptions);
    }

    describe('decrypts and denormalizes values', function() {
      it('of type `bit`', function() {
        for (const typeInfo of ['32', '6801']) {
          assert.strictEqual(decryptNormalized(typeInfo, '0100000000000000'), true);
          assert.strictEqual(decryptNormalized(typeInfo, '0000000000000000'), false);
        }
      });

      it('of the integer types', function() {
        // tinyint
        for (const typeInfo of ['30', '2601']) {
          assert.strictEqual(decryptNormalized(typeInfo, 'ff00000000000000'), 255);
        }

        // smallint
        for (const typeInfo of ['34', '2602']) {
          assert.strictEqual(decryptNormalized(typeInfo, '0201000000000000'), 258);
          assert.strictEqual(decryptNormalized(typeInfo, 'feffffffffffffff'), -2);
        }

        // int
        for (const typeInfo of ['38', '2604']) {
          assert.strictEqual(decryptNormalized(typeInfo, 'ffffff7f00000000'), 2147483647);
          assert.strictEqual(decryptNormalized(typeInfo, '00000080ffffffff'), -2147483648);
        }

        // bigint
        for (const typeInfo of ['7f', '2608']) {
          assert.strictEqual(decryptNormalized(typeInfo, 'ffffffffffffff7f'), '9223372036854775807');
          assert.strictEqual(decryptNormalized(typeInfo, 'feffffffffffffff'), '-2');
        }
      });

      it('of the floating point types', function() {
        for (const typeInfo of ['3b', '6d04']) {
          assert.strictEqual(decryptNormalized(typeInfo, '0000c03f'), 1.5);
        }

        for (const typeInfo of ['3e', '6d08']) {
          assert.strictEqual(decryptNormalized(typeInfo, '000000000000f83f'), 1.5);
        }
      });

      it('of the money types', function() {
        // smallmoney and money, which are both normalized to money
        for (const typeInfo of ['7a', '6e04', '3c', '6e08']) {
          assert.strictEqual(decryptNormalized(typeInfo, '00000000983a0000'), 1.5);
          assert.strictEqual(decryptNormalized(typeInfo, 'ffffffff68c5ffff'), -1.5);
        }
      });

      it('of the decimal types', function() {
        // The sign, followed by a magnitude of 16 bytes
        const magnitude = '15cd5b07' + '00'.repeat(12);

        // decimal(18, 4) and numeric(38, 4)
        for (const typeInfo of ['6a091204', '6c112604']) {
          assert.strictEqual(decryptNormalized(typeInfo, '01' + magnitude), 12345.6789);
          assert.strictEqual(decryptNormalized(typeInfo, '00' + magnitude), -12345.6789);
        }
      });

      it('of type `uniqueidentifier`', function() {
        assert.strictEqual(decryptNormalized('2410', '67452301ab89efcd0123456789abcdef'), '01234567-89AB-CDEF-0123-456789ABCDEF');
        assert.strictEqual(decryptNormalized('2410', '67452301ab89efcd0123456789abcdef', { ...options, lowerCaseGuids: true }), '01234567-89ab-cdef-0123-456789abcdef');
      });

      it('of the date and time types', function() {
        assert.deepEqual(decryptNormalized('28', DATE), new Date('2020-02-29T00:00:00Z'));

        for (const typeInfo of ['2907', '2903', '2900']) {
          const value = decryptNormalized(typeInfo, TIME) as Date & { nanosecondsDelta: number };
          assert.deepEqual(value, new Date('1970-01-01T12:34:56.123Z'));
          assert.closeTo(value.nanosecondsDelta, 0.0004567, 1e-10);
        }

        for (const typeInfo of ['2a07', '2a03']) {
          const value = decryptNormalized(typeInfo, TIME + DATE) as Date & { nanosecondsDelta: number };
          assert.deepEqual(value, new Date('2020-02-29T12:34:56.123Z'));
          assert.closeTo(value.nanosecondsDelta, 0.0004567, 1e-10);
        }

        // An offset of +02:00, which does not change the point in time
        const offset = '7800';
        for (const typeInfo of ['2b07', '2b03']) {
          const value = decryptNormalized(typeInfo, TIME + DATE + offset) as Date & { nanosecondsDelta: number };
          assert.deepEqual(value, new Date('2020-02-29T12:34:56.123Z'));
        }

        // datetime
        for (const typeInfo of ['3d', '6f08']) {
          assert.deepEqual(decryptNormalized(typeInfo, DATETIME), new Date('2020-02-29T12:34:56.123Z'));
        }

        // smalldatetime
        for (const typeInfo of ['3a', '6f04']) {
          assert.deepEqual(decryptNormalized(typeInfo, SMALLDATETIME), new Date('2020-02-29T12:34:00Z'));
        }
      });

      it('of the date and time types in local time if `useUTC` is not set', function() {
        const local = { ...options, useUTC: false };

        assert.deepEqual(decryptNormalized('28', DATE, local), new Date(2020, 1, 29));
        assert.deepEqual(decryptNormalized('2a07', TIME + DATE, local), new Date(2020, 1, 29, 12, 34, 56, 123));
        assert.deepEqual(decryptNormalized('6f08', DATETIME, local), new Date(2020, 1, 29, 12, 34, 56, 123));
      });

      it('of the character types', function() {
        // varchar(50), in the code page of the column's collation
        assert.strictEqual(decryptNormalized('a73200' + COLLATION, '61626320e4'), 'abc ä');
        assert.strictEqual(decryptNormalized('a73200' + COLLATION, ''), '');

        // nvarchar(50)
        assert.strictEqual(decryptNormalized('e76400' + COLLATION, '610062002000e4000326'), 'ab ä☃');
        assert.strictEqual(decryptNormalized('e76400' + COLLATION, ''), '');
      });

      it('of the binary types', function() {
        assert.deepEqual(decryptNormalized('a53200', '01020300'), Buffer.from('01020300', 'hex'));
        assert.deepEqual(decryptNormalized('a53200', ''), Buffer.alloc(0));
      });

      it('of fixed length types, padded to the length of the type', function() {
        // char(5), nchar(5) and binary(5)
        assert.strictEqual(decryptNormalized('af0500' + COLLATION, '6162'), 'ab   ');
        assert.strictEqual(decryptNormalized('ef0a00' + COLLATION, '61006200'), 'ab   ');
        assert.deepEqual(decryptNormalized('ad0500', '0102'), Buffer.from('0102000000', 'hex'));

        assert.strictEqual(decryptNormalized('af0500' + COLLATION, '6162636465'), 'abcde');
        assert.strictEqual(decryptNormalized('ef0a00' + COLLATION, '61006200630064006500'), 'abcde');
        assert.deepEqual(decryptNormalized('ad0500', '0102030405'), Buffer.from('0102030405', 'hex'));
      });
    });

    it('returns `null` for `null` values', function() {
      for (const typeInfo of ['2604', 'e76400' + COLLATION, '2a07', '6a091204']) {
        assert.isNull(decrypt(typeInfo, null));
      }
    });

    it('fails for values that do not have the length of a normalized value', function() {
      for (const [typeInfo, normalized, message] of [
        ['2604', '2a000000', 'Unexpected length 4 of a decrypted IntN value, expected 8'],
        ['6801', '01', 'Unexpected length 1 of a decrypted BitN value, expected 8'],
        ['6d08', '000000', 'Unsupported dataLength 3 for FloatN'],
        ['6e04', '983a0000', 'Unexpected length 4 of a decrypted MoneyN value, expected 8'],
        ['6a091204', '0115cd5b07', 'Unexpected length 5 of a decrypted DecimalN value, expected 17'],
        ['2410', '0102', 'Unexpected length 2 of a decrypted UniqueIdentifier value, expected 16'],
        ['28', 'cb400b00', 'Unexpected length 4 of a decrypted Date value, expected 3'],
        ['2903', '87ee97', 'Unexpected length 3 of a decrypted Time value, expected 5'],
        ['2a03', '87ee97cb400b', 'Unexpected length 6 of a decrypted DateTime2 value, expected 8'],
        ['2b03', '87ee977669cb400b', 'Unexpected length 8 of a decrypted DateTimeOffset value, expected 10'],
        ['6f08', '70ab00', 'Unsupported dataLength 3 for DateTimeN']
      ]) {
        assert.throws(() => decryptNormalized(typeInfo, normalized), message);
      }
    });

    it('fails for types that can not be encrypted', function() {
      // xml
      assert.throws(() => decryptNormalized('f100', '3c612f3e'), 'Unsupported type Xml of an encrypted value');
    });

    it('decrypts rows with encrypted and unencrypted columns', function() {
      const { parser, tokens: [metadata] } = parse(colMetadata([[key], [{ ...key, keyPath: 'key/2' }]], [
        { name: 'id', typeInfo: '38' },
        { name: 'ssn', typeInfo: 'a70b00' + COLLATION, encrypted: { keyOrdinal: 0 } },
        { name: 'name', typeInfo: 'e76400' + COLLATION },
        { name: 'salary', typeInfo: '2604', encrypted: { keyOrdinal: 1, encryptionType: 2 } }
      ]));

      const [first, second] = (metadata as ColMetadataToken).columnEncryptionKeys!;
      first.cipher = cipher;
      second.cipher = new ColumnEncryptionCipher(Buffer.alloc(32, 0x02));

      const name = Buffer.from('Jane', 'ucs2');
      const data = Buffer.concat([
        row(
          Buffer.from('01000000', 'hex'),
          varbinary(cipher.encrypt(Buffer.from('795-73-9838'), true)),
          varbinary(name),
          varbinary(second.cipher.encrypt(Buffer.from('2a00000000000000', 'hex'), false))
        ),
        row(Buffer.from('02000000', 'hex'), varbinary(null), varbinary(null), varbinary(null))
      ]);

      for (const chunks of [[data], singleBytes(data)]) {
        const tokens = parseMore(parser, chunks);

        assert.lengthOf(tokens, 2);
        assert.deepEqual(values(tokens[0]), [1, '795-73-9838', 'Jane', 42]);
        assert.deepEqual(values(tokens[1]), [2, null, null, null]);
      }

      parser.end();
    });

    it('decrypts the rows of an NBCROW token', function() {
      const { parser, tokens: [metadata] } = parse(colMetadata([[key]], [
        { name: 'a', typeInfo: '2604', encrypted: {} },
        { name: 'b', typeInfo: '2604', encrypted: {} },
        { name: 'c', typeInfo: 'e7ffff' + COLLATION, encrypted: { typeInfo: VARBINARY_MAX } },
        { name: 'd', typeInfo: '2604', encrypted: {} }
      ]));
      (metadata as ColMetadataToken).columnEncryptionKeys![0].cipher = cipher;

      // The first and third column are `null`.
      const data = Buffer.concat([Buffer.from([0xD2, 0b0101]), varbinary(encrypt('0200000000000000')), varbinary(encrypt('0400000000000000'))]);

      for (const chunks of [[data], singleBytes(data)]) {
        const [token] = parseMore(parser, chunks);

        assert.instanceOf(token, NBCRowToken);
        assert.deepEqual(values(token), [null, 2, null, 4]);
      }
    });

    it('decrypts values that are sent as PLP values', function() {
      // nvarchar(max), varchar(8000), varbinary(max) and int: whether a
      // value is sent as a PLP value depends on how the encrypted value
      // is sent, not on the type of the decrypted value.
      const { parser, tokens: [metadata] } = parse(colMetadata([[key]], [
        { name: 'a', typeInfo: 'e7ffff' + COLLATION, encrypted: { typeInfo: VARBINARY_MAX } },
        { name: 'b', typeInfo: 'a7401f' + COLLATION, encrypted: { typeInfo: VARBINARY_MAX } },
        { name: 'c', typeInfo: 'a5ffff', encrypted: { typeInfo: VARBINARY_MAX } },
        { name: 'd', typeInfo: '2604', encrypted: { typeInfo: VARBINARY_MAX } },
        { name: 'e', typeInfo: 'e7ffff' + COLLATION, encrypted: { typeInfo: VARBINARY_MAX } }
      ]));
      (metadata as ColMetadataToken).columnEncryptionKeys![0].cipher = cipher;

      const text = 'hello wörld ☃ '.repeat(1000);
      const binary = randomBytes(20000);

      const data = row(
        plp(cipher.encrypt(Buffer.from(text, 'ucs2'), false), 4000),
        plp(cipher.encrypt(Buffer.from('x'.repeat(8000)), false), 4000),
        plp(cipher.encrypt(binary, true), 7),
        plp(encrypt('2a00000000000000')),
        plp(null)
      );

      for (const chunks of [[data], [data.subarray(0, 5000), data.subarray(5000, 5001), data.subarray(5001)]]) {
        const [token] = parseMore(parser, chunks);
        assert.deepEqual(values(token), [text, 'x'.repeat(8000), binary, 42, null]);
      }

      parser.end();
    });

    it('returns values as they are sent while their column encryption key is not loaded', function() {
      const { parser } = parse(colMetadata([[key]], [
        { name: 'a', typeInfo: '2604', encrypted: {} },
        { name: 'b', typeInfo: 'e7ffff' + COLLATION, encrypted: { typeInfo: VARBINARY_MAX } }
      ]));

      const a = encrypt('2a00000000000000');
      const b = cipher.encrypt(Buffer.from('secret', 'ucs2'), false);

      const [token] = parseMore(parser, row(varbinary(a), plp(b)));
      assert.deepEqual(values(token), [a, b]);
    });

    it('returns values as they are sent if column encryption is disabled', function() {
      const { parser } = parse(colMetadata([[key]], [
        { name: 'a', typeInfo: '2604', encrypted: {} },
        { name: 'b', typeInfo: 'e7ffff' + COLLATION, encrypted: { typeInfo: VARBINARY_MAX } }
      ]), { ...options, columnEncryption: undefined });

      const a = encrypt('2a00000000000000');
      const b = cipher.encrypt(Buffer.from('secret', 'ucs2'), false);

      const [token] = parseMore(parser, row(varbinary(a), plp(b)));
      assert.deepEqual(values(token), [a, b]);
    });

    it('records the error of a value that can not be decrypted on its key, and leaves values encrypted from there on', function() {
      const otherKey = { ...key, keyPath: 'key/2' };
      const { parser, tokens: [metadata] } = parse(colMetadata([[key], [otherKey]], [
        { name: 'a', typeInfo: '2604', encrypted: { keyOrdinal: 0 } },
        { name: 'b', typeInfo: '2604', encrypted: { keyOrdinal: 1 } },
        { name: 'c', typeInfo: 'e7ffff' + COLLATION, encrypted: { keyOrdinal: 0, typeInfo: VARBINARY_MAX } }
      ]));

      const [first, second] = (metadata as ColMetadataToken).columnEncryptionKeys!;
      first.cipher = cipher;
      second.cipher = cipher;

      const valid = encrypt('2a00000000000000');
      const text = cipher.encrypt(Buffer.from('secret', 'ucs2'), false);
      const tampered = Buffer.from(valid);
      tampered[tampered.length - 1] ^= 0x01;

      const tokens = parseMore(parser, Buffer.concat([
        row(varbinary(valid), varbinary(valid), plp(text)),
        row(varbinary(tampered), varbinary(valid), plp(text)),
        row(varbinary(valid), varbinary(valid), plp(text))
      ]));

      assert.lengthOf(tokens, 3);
      assert.deepEqual(values(tokens[0]), [42, 42, 'secret']);

      // The values of the other key are still decrypted.
      assert.deepEqual(values(tokens[1]), [tampered, 42, text]);
      assert.deepEqual(values(tokens[2]), [valid, 42, text]);

      assert.strictEqual(first.error!.message, 'The encrypted value has an invalid authentication tag.');
      assert.isUndefined(first.cipher);

      assert.isUndefined(second.error);
      assert.strictEqual(second.cipher, cipher);

      parser.end();
    });
  });

  describe('RETURNVALUE', function() {
    function returnValue(column: ColumnDefinition, value: Buffer): Buffer {
      const buffer = new WritableTrackingBuffer();
      buffer.writeUInt8(0xAC);
      buffer.writeUInt16LE(3); // ordinal
      buffer.writeBVarchar('@' + column.name, 'ucs2');
      buffer.writeUInt8(0x01); // status
      buffer.writeUInt32LE(0); // user type
      buffer.writeUInt16LE(FLAG_NULLABLE | FLAG_ENCRYPTED);
      buffer.writeBuffer(Buffer.from(column.encrypted!.typeInfo ?? VARBINARY_8000, 'hex'));
      // Does not refer to a column encryption key.
      writeCryptoMetadata(buffer, column, false);
      buffer.writeBuffer(value);

      return buffer.data;
    }

    it('parses an encrypted return value, which is left encrypted', function() {
      const encrypted = encrypt('2a00000000000000', false);
      const data = returnValue({ name: 'salary', typeInfo: '2604', encrypted: { encryptionType: 2 } }, varbinary(encrypted));

      for (const chunks of [[data], singleBytes(data)]) {
        const { parser, tokens } = parse(chunks);

        assert.lengthOf(tokens, 1);
        const token = tokens[0] as ReturnValueToken;

        assert.instanceOf(token, ReturnValueToken);
        assert.strictEqual(token.paramName, 'salary');
        assert.strictEqual(token.paramOrdinal, 3);
        assert.strictEqual(token.metadata.type.name, 'IntN');
        assert.deepEqual(token.metadata.cryptoMetadata, { key: undefined, encryptionType: 'randomized', algorithmId: 2, algorithmName: undefined, normalizationRuleVersion: 1, isPLP: false });
        assert.deepEqual(token.value, encrypted);

        parser.end();
      }
    });

    it('parses an encrypted return value that is sent as a PLP value', function() {
      const encrypted = cipher.encrypt(Buffer.from('secret', 'ucs2'), false);
      const data = returnValue({ name: 'notes', typeInfo: 'e7ffff' + COLLATION, encrypted: { typeInfo: VARBINARY_MAX } }, plp(encrypted, 10));

      for (const chunks of [[data], singleBytes(data)]) {
        const { tokens: [token] } = parse(chunks);

        assert.strictEqual((token as ReturnValueToken).metadata.type.name, 'NVarChar');
        assert.isTrue((token as ReturnValueToken).metadata.cryptoMetadata!.isPLP);
        assert.deepEqual((token as ReturnValueToken).value, encrypted);
      }
    });

    it('parses a `null` return value', function() {
      const { tokens: [token] } = parse(returnValue({ name: 'salary', typeInfo: '2604', encrypted: {} }, varbinary(null)));

      assert.isNull((token as ReturnValueToken).value);
    });

    it('describes an encrypted return value as it is sent if column encryption is disabled', function() {
      const encrypted = encrypt('2a00000000000000');
      const data = returnValue({ name: 'salary', typeInfo: '2604', encrypted: {} }, varbinary(encrypted));

      const { tokens: [token] } = parse(data, { ...options, columnEncryption: undefined });

      assert.strictEqual((token as ReturnValueToken).metadata.type.name, 'VarBinary');
      assert.isUndefined((token as ReturnValueToken).metadata.cryptoMetadata);
      assert.deepEqual((token as ReturnValueToken).value, encrypted);
    });
  });
});

describe('handling tokens with column encryption', function() {
  /**
   * The request that is completed with the response made up of `data`.
   */
  function handle(data: Buffer, parserOptions: ParserOptions = options, setup?: (request: Request) => void): Promise<{ request: Request, rows: unknown[][], returnValues: { [name: string]: unknown } }> {
    return new Promise((resolve, reject) => {
      const rows: unknown[][] = [];
      const returnValues: { [name: string]: unknown } = {};

      const request = new Request('SELECT 1', () => {});
      request.rowCount = 0;
      request.on('row', (columns: Column[]) => {
        rows.push(columns.map((column) => column.value));
      });
      request.on('returnValue', (name, value) => {
        returnValues[name] = value;
      });
      setup?.(request);

      const connection = { config: { options: parserOptions }, emit() {}, forgetParameterEncryptionMetadata() {} } as unknown as Connection;
      const handler = new RequestTokenHandler(connection, request);

      const parser = new TokenStreamParser([data], new Debug(), handler, parserOptions);
      parser.on('end', () => resolve({ request, rows, returnValues }));
      parser.on('error', reject);
    });
  }

  const done = Buffer.from('fd0000c1000000000000000000', 'hex');

  const metadata = colMetadata([[key]], [
    { name: 'id', typeInfo: '38' },
    { name: 'salary', typeInfo: '2604', encrypted: {} }
  ]);

  const rows = Buffer.concat([
    row(Buffer.from('01000000', 'hex'), varbinary(encrypt('2a00000000000000'))),
    row(Buffer.from('02000000', 'hex'), varbinary(encrypt('2b00000000000000')))
  ]);

  it('loads the column encryption keys before the rows of a result set are parsed', async function() {
    let resolveKey!: (key: Buffer) => void;
    const parserOptions = {
      ...options,
      columnEncryption: validateColumnEncryptionOptions({
        keyStoreProviders: {
          TEST: {
            decryptColumnEncryptionKey() {
              return new Promise<Buffer>((resolve) => {
                resolveKey = resolve;
              });
            }
          }
        }
      })
    };

    const result = handle(Buffer.concat([metadata, rows, done]), parserOptions);

    // The key store takes its time.
    await new Promise((resolve) => setTimeout(resolve, 20));
    resolveKey(columnEncryptionKey);

    const { request, rows: decrypted } = await result;
    assert.isUndefined(request.error);
    assert.deepEqual(decrypted, [[1, 42], [2, 43]]);
  });

  it('fails the request if a column encryption key can not be loaded, and skips the rows of its result set', async function() {
    const parserOptions = {
      ...options,
      columnEncryption: validateColumnEncryptionOptions({
        keyStoreProviders: {
          TEST: {
            async decryptColumnEncryptionKey() {
              throw new Error('no access');
            }
          }
        }
      })
    };

    // The result set is followed by one without encrypted columns.
    const plain = Buffer.concat([colMetadata([], [{ name: 'id', typeInfo: '38' }]), row(Buffer.from('03000000', 'hex'))]);
    const { request, rows: emitted } = await handle(Buffer.concat([metadata, rows, done, plain, done]), parserOptions);

    assert.instanceOf(request.error, RequestError);
    assert.strictEqual((request.error as RequestError).code, 'ECOLUMNENCRYPTION');
    assert.strictEqual(request.error!.message, 'Failed to decrypt the values of an encrypted column: The key store provider "TEST" failed to decrypt a column encryption key with the column master key "key/1": no access');
    assert.deepEqual(emitted, [[3]]);
  });

  it('fails the request for a result set that uses an unsupported encryption algorithm', async function() {
    const custom = colMetadata([[key]], [{ name: 'value', typeInfo: '2604', encrypted: { algorithmId: 0, algorithmName: 'CUSTOM' } }]);
    const { request, rows: emitted } = await handle(Buffer.concat([custom, row(varbinary(encrypt('2a00000000000000'))), done]));

    assert.strictEqual((request.error as RequestError).code, 'ECOLUMNENCRYPTION');
    assert.match(request.error!.message, /Unsupported column encryption algorithm "CUSTOM"/);
    assert.deepEqual(emitted, []);
  });

  it('fails the request if a value can not be decrypted, and skips the remaining rows of its result set', async function() {
    const tampered = encrypt('2b00000000000000');
    tampered[tampered.length - 1] ^= 0x01;

    const data = Buffer.concat([
      metadata,
      row(Buffer.from('01000000', 'hex'), varbinary(encrypt('2a00000000000000'))),
      row(Buffer.from('02000000', 'hex'), varbinary(tampered)),
      row(Buffer.from('03000000', 'hex'), varbinary(encrypt('2c00000000000000'))),
      done,
      metadata,
      row(Buffer.from('04000000', 'hex'), varbinary(encrypt('2d00000000000000'))),
      done
    ]);

    const { request, rows: emitted } = await handle(data);

    assert.strictEqual((request.error as RequestError).code, 'ECOLUMNENCRYPTION');
    assert.strictEqual(request.error!.message, 'Failed to decrypt the values of an encrypted column: The encrypted value has an invalid authentication tag.');
    assert.deepEqual(emitted, [[1, 42], [4, 45]]);
  });

  it('does not load column encryption keys for canceled requests', async function() {
    let calls = 0;
    const parserOptions = {
      ...options,
      columnEncryption: validateColumnEncryptionOptions({
        keyStoreProviders: {
          TEST: {
            decryptColumnEncryptionKey() {
              calls += 1;
              return columnEncryptionKey;
            }
          }
        },
        keyCacheTTL: 0
      })
    };

    const { rows: emitted } = await handle(Buffer.concat([metadata, rows, done]), parserOptions, (request) => {
      request.canceled = true;
    });

    assert.strictEqual(calls, 0);
    assert.deepEqual(emitted, []);
  });

  describe('return values', function() {
    function returnValue(name: string, value: Buffer): Buffer {
      const buffer = new WritableTrackingBuffer();
      buffer.writeUInt8(0xAC);
      buffer.writeUInt16LE(0);
      buffer.writeBVarchar('@' + name, 'ucs2');
      buffer.writeUInt8(0x01);
      buffer.writeUInt32LE(0);
      buffer.writeUInt16LE(FLAG_NULLABLE | FLAG_ENCRYPTED);
      buffer.writeBuffer(Buffer.from(VARBINARY_8000, 'hex'));
      writeCryptoMetadata(buffer, { name, typeInfo: '2604', encrypted: { encryptionType: 2 } }, false);
      buffer.writeBuffer(value);

      return buffer.data;
    }

    it('decrypts the value of an encrypted output parameter with the cipher of the parameter', async function() {
      const data = Buffer.concat([returnValue('salary', varbinary(encrypt('2a00000000000000', false))), returnValue('bonus', varbinary(null)), done]);

      const { request, returnValues } = await handle(data, options, (request) => {
        request.parameterEncryption = { cacheKey: 'key', ciphers: new Map([['salary', cipher], ['bonus', cipher]]) };
      });

      assert.isUndefined(request.error);
      assert.deepEqual(returnValues, { salary: 42, bonus: null });
    });

    it('fails the request if the output parameter was not encrypted', async function() {
      const data = Buffer.concat([returnValue('salary', varbinary(encrypt('2a00000000000000', false))), done]);

      const { request, returnValues } = await handle(data);

      assert.strictEqual((request.error as RequestError).code, 'ECOLUMNENCRYPTION');
      assert.strictEqual(request.error!.message, 'Failed to decrypt the value of the output parameter "salary": The parameter was not encrypted.');
      assert.deepEqual(returnValues, {});
    });

    it('fails the request if the value can not be decrypted', async function() {
      const data = Buffer.concat([returnValue('salary', varbinary(encrypt('2a00000000000000', false))), done]);

      const { request, returnValues } = await handle(data, options, (request) => {
        request.parameterEncryption = { cacheKey: 'key', ciphers: new Map([['salary', new ColumnEncryptionCipher(Buffer.alloc(32, 0x02))]]) };
      });

      assert.strictEqual((request.error as RequestError).code, 'ECOLUMNENCRYPTION');
      assert.strictEqual(request.error!.message, 'Failed to decrypt the value of the output parameter "salary": The encrypted value has an invalid authentication tag.');
      assert.deepEqual(returnValues, {});
    });
  });
});

describe('Token Stream Parser', function() {
  it('waits for a handler that returns a promise before parsing the tokens that follow', async function() {
    const events: string[] = [];

    class Handler extends TokenHandler {
      async onColMetadata() {
        events.push('COLMETADATA');
        await new Promise((resolve) => setTimeout(resolve, 20));
        events.push('COLMETADATA handled');
      }

      onRow() {
        events.push('ROW');
      }

      onDone(token: DoneToken) {
        events.push('DONE');
      }
    }

    const data = Buffer.concat([
      colMetadata([], [{ name: 'id', typeInfo: '38' }]),
      row(Buffer.from('01000000', 'hex')),
      row(Buffer.from('02000000', 'hex')),
      Buffer.from('fd0000c1000000000000000000', 'hex')
    ]);

    await new Promise((resolve, reject) => {
      const parser = new TokenStreamParser([data], new Debug(), new Handler(), options);
      parser.on('end', resolve);
      parser.on('error', reject);
    });

    assert.deepEqual(events, ['COLMETADATA', 'COLMETADATA handled', 'ROW', 'ROW', 'DONE']);
  });

  it('fails if a handler returns a promise that is rejected', async function() {
    class Handler extends TokenHandler {
      async onColMetadata() {
        throw new Error('failed to handle');
      }
    }

    const error = await new Promise<Error>((resolve, reject) => {
      const parser = new TokenStreamParser([colMetadata([], [{ name: 'id', typeInfo: '38' }])], new Debug(), new Handler(), options);
      parser.on('end', () => reject(new Error('expected an error')));
      parser.on('error', resolve);
    });

    assert.strictEqual(error.message, 'failed to handle');
  });
});
