import { assert } from 'chai';
import { Readable } from 'stream';

import { ColumnEncryptionCipher } from '../../../src/always-encrypted/cipher';
import {
  describeStatement,
  encryptParameters,
  createDescribeRequest,
  ParameterEncryptionMetadataCache,
  readParameterEncryptionMetadata,
  type ParameterEncryptionMetadata
} from '../../../src/always-encrypted/parameter-encryption';
import { type ColumnEncryptionKeyInfo } from '../../../src/always-encrypted/types';
import { Collation } from '../../../src/collation';
import { type InternalConnectionOptions } from '../../../src/connection';
import { typeByName as TYPES, resolveParameter, type DataType, type Parameter } from '../../../src/data-type';
import { RequestError } from '../../../src/errors';
import Request, { type ParameterOptions } from '../../../src/request';
import RpcRequestPayload from '../../../src/rpcrequest-payload';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';

const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;

// SQL_Latin1_General_CP1_CI_AS
const collation = Collation.fromBuffer(Buffer.from([0x09, 0x04, 0xD0, 0x00, 0x34]));

const cipher = new ColumnEncryptionCipher(Buffer.from('ED6FBC93EECDE0BFC6494FFB2EDB7998B7E94EF71FEDE584741A855238F0155E', 'hex'));

function createKey(): ColumnEncryptionKeyInfo {
  return {
    databaseId: 5,
    keyId: 0x01020304,
    keyVersion: 2,
    metadataVersion: Buffer.from('1122334455667788', 'hex'),
    values: [],
    cipher
  };
}

function parameter(name: string, type: DataType, value: unknown, parameterOptions: ParameterOptions = {}): Parameter {
  return { name, type, value, output: false, length: undefined, precision: undefined, scale: undefined, ...parameterOptions };
}

/**
 * Encrypts a single parameter, with deterministic encryption.
 */
function encrypt(type: DataType, value: unknown, parameterOptions?: ParameterOptions, connectionOptions = options) {
  const parameters = [parameter('value', type, value, parameterOptions)];
  const resolved = parameters.map((parameter) => resolveParameter(parameter, collation, connectionOptions));

  const metadata: ParameterEncryptionMetadata = {
    keys: [],
    parameters: new Map([['value', { key: createKey(), algorithmId: 2, encryptionType: 1, normalizationRuleVersion: 1 }]])
  };

  const [encrypted] = encryptParameters(parameters, resolved, metadata, new Map(), connectionOptions);
  return encrypted;
}

/**
 * The normalized value that was encrypted for a parameter, as hex.
 */
function normalized(type: DataType, value: unknown, parameterOptions?: ParameterOptions, connectionOptions = options): string {
  return cipher.decrypt(encrypt(type, value, parameterOptions, connectionOptions).data.value).toString('hex');
}

function littleEndian(value: bigint | number, length: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt.asUintN(64, BigInt(value)));
  return buffer.subarray(0, length).toString('hex');
}

async function payload(parameters: RpcRequestPayload['parameters']): Promise<Buffer> {
  const chunks = [];
  for await (const chunk of new RpcRequestPayload('proc', parameters, Buffer.alloc(8), options)) {
    chunks.push(chunk);
  }

  const data = Buffer.concat(chunks);

  // Skip the headers, the name of the procedure and the option flags.
  const headersLength = data.readUInt32LE(0);
  return data.subarray(headersLength + 2 + 'proc'.length * 2 + 2);
}

describe('encryptParameters', function() {
  describe('normalizes values', function() {
    it('of type `bit`', function() {
      assert.strictEqual(normalized(TYPES.Bit, true), '0100000000000000');
      assert.strictEqual(normalized(TYPES.Bit, false), '0000000000000000');
    });

    it('of the integer types', function() {
      assert.strictEqual(normalized(TYPES.TinyInt, 0), '0000000000000000');
      assert.strictEqual(normalized(TYPES.TinyInt, 255), 'ff00000000000000');

      assert.strictEqual(normalized(TYPES.SmallInt, 258), '0201000000000000');
      assert.strictEqual(normalized(TYPES.SmallInt, -2), 'feffffffffffffff');
      assert.strictEqual(normalized(TYPES.SmallInt, -32768), '0080ffffffffffff');

      assert.strictEqual(normalized(TYPES.Int, 1), '0100000000000000');
      assert.strictEqual(normalized(TYPES.Int, -1), 'ffffffffffffffff');
      assert.strictEqual(normalized(TYPES.Int, 2147483647), 'ffffff7f00000000');
      assert.strictEqual(normalized(TYPES.Int, -2147483648), '00000080ffffffff');

      assert.strictEqual(normalized(TYPES.BigInt, '-2'), 'feffffffffffffff');
      assert.strictEqual(normalized(TYPES.BigInt, '9223372036854775807'), 'ffffffffffffff7f');
    });

    it('of an integer type to the same value as those of the other integer types', function() {
      for (const value of [0, 1, 127]) {
        const expected = normalized(TYPES.BigInt, value);

        assert.strictEqual(normalized(TYPES.TinyInt, value), expected);
        assert.strictEqual(normalized(TYPES.SmallInt, value), expected);
        assert.strictEqual(normalized(TYPES.Int, value), expected);
      }

      assert.strictEqual(normalized(TYPES.SmallInt, -127), normalized(TYPES.BigInt, -127));
      assert.strictEqual(normalized(TYPES.Int, -127), normalized(TYPES.BigInt, -127));
    });

    it('of the floating point types', function() {
      assert.strictEqual(normalized(TYPES.Real, 1.5), '0000c03f');
      assert.strictEqual(normalized(TYPES.Float, 1.5), '000000000000f83f');
    });

    it('of the money types', function() {
      // The high, followed by the low 32 bits of the value in ten-thousandths.
      assert.strictEqual(normalized(TYPES.Money, 1.5), '00000000983a0000');
      assert.strictEqual(normalized(TYPES.Money, -1.5), 'ffffffff68c5ffff');
      assert.strictEqual(normalized(TYPES.Money, 123456789012.1234), littleEndian(1234567890121234n >> 32n, 4) + littleEndian(1234567890121234n, 4));

      // `smallmoney` values are normalized to `money` values.
      assert.strictEqual(normalized(TYPES.SmallMoney, 1.5), normalized(TYPES.Money, 1.5));
      assert.strictEqual(normalized(TYPES.SmallMoney, -1.5), normalized(TYPES.Money, -1.5));
      assert.strictEqual(normalized(TYPES.SmallMoney, -214748.3648), normalized(TYPES.Money, -214748.3648));
    });

    it('of the decimal types', function() {
      // The sign, followed by a magnitude of 16 bytes whatever the precision.
      const magnitude = littleEndian(123456789, 8) + littleEndian(0, 8);

      for (const type of [TYPES.Decimal, TYPES.Numeric]) {
        assert.strictEqual(normalized(type, 12345.6789, { precision: 9, scale: 4 }), '01' + magnitude);
        assert.strictEqual(normalized(type, 12345.6789, { precision: 18, scale: 4 }), '01' + magnitude);
        assert.strictEqual(normalized(type, -12345.6789, { precision: 28, scale: 4 }), '00' + magnitude);
        assert.strictEqual(normalized(type, 12345.6789, { precision: 38, scale: 4 }), '01' + magnitude);
        assert.strictEqual(normalized(type, 0, { precision: 18, scale: 0 }), '01' + '00'.repeat(16));
      }

      assert.strictEqual(normalized(TYPES.Numeric, 1e20, { precision: 38, scale: 0 }), '01' + littleEndian(10n ** 20n, 8) + littleEndian((10n ** 20n) >> 64n, 8));
    });

    it('of type `uniqueidentifier`', function() {
      assert.strictEqual(normalized(TYPES.UniqueIdentifier, '01234567-89AB-CDEF-0123-456789ABCDEF'), '67452301ab89efcd0123456789abcdef');
    });

    it('of type `date`', function() {
      // The number of days since 0001-01-01
      assert.strictEqual(normalized(TYPES.Date, new Date('0001-01-01T00:00:00Z')), '000000');
      assert.strictEqual(normalized(TYPES.Date, new Date('2020-02-29T00:00:00Z')), littleEndian(737483, 3));
    });

    it('of type `time` to a scale of 7', function() {
      const time = new Date('1970-01-01T12:34:56.123Z');

      // The number of 100 nanosecond intervals since midnight, in 5 bytes
      const expected = littleEndian((12n * 3600n + 34n * 60n + 56n) * 10_000_000n + 1_230_000n, 5);

      for (const scale of [3, 4, 5, 6, 7]) {
        assert.strictEqual(normalized(TYPES.Time, time, { scale }), expected, `scale ${scale}`);
      }

      // The value is rounded to the scale of its type.
      assert.strictEqual(normalized(TYPES.Time, time, { scale: 2 }), littleEndian(45296n * 10_000_000n + 1_200_000n, 5));
      assert.strictEqual(normalized(TYPES.Time, time, { scale: 0 }), littleEndian(45296n * 10_000_000n, 5));
    });

    it('of type `time` with their sub-millisecond part', function() {
      const time: Date & { nanosecondDelta?: number } = new Date('1970-01-01T12:34:56.123Z');
      time.nanosecondDelta = 0.0004567;

      assert.strictEqual(normalized(TYPES.Time, time, { scale: 7 }), littleEndian(45296n * 10_000_000n + 1_234_567n, 5));
      assert.strictEqual(normalized(TYPES.Time, time, { scale: 5 }), littleEndian(45296n * 10_000_000n + 1_234_600n, 5));
    });

    it('of type `datetime2` to a scale of 7', function() {
      const value = new Date('2020-02-29T12:34:56.123Z');

      // The time, followed by the date
      const expected = littleEndian(45296n * 10_000_000n + 1_230_000n, 5) + littleEndian(737483, 3);

      for (const scale of [3, 5, 7]) {
        assert.strictEqual(normalized(TYPES.DateTime2, value, { scale }), expected, `scale ${scale}`);
      }

      assert.strictEqual(normalized(TYPES.DateTime2, value, { scale: 0 }), littleEndian(45296n * 10_000_000n, 5) + littleEndian(737483, 3));
    });

    it('of type `datetimeoffset` to a scale of 7', function() {
      const value = new Date('2020-02-29T12:34:56.123Z');

      // The time and date in UTC, followed by the offset in minutes
      const offset = Buffer.alloc(2);
      offset.writeInt16LE(-value.getTimezoneOffset());
      const expected = littleEndian(45296n * 10_000_000n + 1_230_000n, 5) + littleEndian(737483, 3) + offset.toString('hex');

      for (const scale of [3, 5, 7]) {
        assert.strictEqual(normalized(TYPES.DateTimeOffset, value, { scale }), expected, `scale ${scale}`);
      }
    });

    it('of type `datetime` and `smalldatetime`', function() {
      // The days since 1900-01-01, followed by the 300ths of a second
      // since midnight
      assert.strictEqual(normalized(TYPES.DateTime, new Date('2020-02-29T12:34:56.123Z')), littleEndian(43888, 4) + littleEndian(45296 * 300 + 37, 4));

      // The days since 1900-01-01, followed by the minutes since midnight
      assert.strictEqual(normalized(TYPES.SmallDateTime, new Date('2020-02-29T12:34:00Z')), littleEndian(43888, 2) + littleEndian(12 * 60 + 34, 2));
    });

    it('of the date and time types in local time if `useUTC` is not set', function() {
      const local = { ...options, useUTC: false };
      const value = new Date(2020, 1, 29, 12, 34, 56, 123);

      assert.strictEqual(normalized(TYPES.DateTime2, value, { scale: 7 }, local), littleEndian(45296n * 10_000_000n + 1_230_000n, 5) + littleEndian(737483, 3));
      assert.strictEqual(normalized(TYPES.Date, value, {}, local), littleEndian(737483, 3));
    });

    it('of the character types', function() {
      // Encoded with the collation of the connection
      assert.strictEqual(normalized(TYPES.VarChar, 'abc ä'), '61626320e4');
      assert.strictEqual(normalized(TYPES.Char, 'abc', { length: 10 }), '616263');

      assert.strictEqual(normalized(TYPES.NVarChar, 'ab ä☃'), '610062002000e4000326');
      assert.strictEqual(normalized(TYPES.NChar, 'ab', { length: 10 }), '61006200');

      assert.strictEqual(normalized(TYPES.VarChar, ''), '');
      assert.strictEqual(normalized(TYPES.NVarChar, ''), '');
    });

    it('of the binary types', function() {
      assert.strictEqual(normalized(TYPES.VarBinary, Buffer.from('01020300', 'hex')), '01020300');
      assert.strictEqual(normalized(TYPES.Binary, Buffer.from('010203', 'hex'), { length: 10 }), '010203');
      assert.strictEqual(normalized(TYPES.VarBinary, Buffer.alloc(0)), '');
    });

    it('that are longer than their type to the length of the type', function() {
      assert.strictEqual(normalized(TYPES.VarChar, 'abcdef', { length: 3 }), '616263');
      assert.strictEqual(normalized(TYPES.Char, 'abcdef', { length: 3 }), '616263');
      assert.strictEqual(normalized(TYPES.NVarChar, 'abcdef', { length: 3 }), '610062006300');
      assert.strictEqual(normalized(TYPES.NChar, 'abcdef', { length: 3 }), '610062006300');
      assert.strictEqual(normalized(TYPES.VarBinary, Buffer.from('010203040506', 'hex'), { length: 3 }), '010203');
      assert.strictEqual(normalized(TYPES.Binary, Buffer.from('010203040506', 'hex'), { length: 3 }), '010203');
    });

    it('that are longer than a type close to its maximum length to the length of the type', function() {
      assert.strictEqual(normalized(TYPES.NVarChar, 'x'.repeat(3500), { length: 3000 }), '7800'.repeat(3000));
      assert.strictEqual(normalized(TYPES.NVarChar, 'x'.repeat(4500), { length: 4000 }), '7800'.repeat(4000));
      assert.strictEqual(normalized(TYPES.NChar, 'x'.repeat(3500), { length: 3000 }), '7800'.repeat(3000));
      assert.strictEqual(normalized(TYPES.VarChar, 'x'.repeat(8100), { length: 8000 }), '78'.repeat(8000));
      assert.strictEqual(normalized(TYPES.VarBinary, Buffer.alloc(8100, 0xAB), { length: 8000 }), 'ab'.repeat(8000));
    });

    it('of the `max` types', function() {
      assert.strictEqual(normalized(TYPES.VarChar, 'x'.repeat(10000)), '78'.repeat(10000));
      assert.strictEqual(normalized(TYPES.NVarChar, 'x'.repeat(10000)), '7800'.repeat(10000));
      assert.strictEqual(normalized(TYPES.VarBinary, Buffer.alloc(10000, 0xAB)), 'ab'.repeat(10000));
      assert.strictEqual(normalized(TYPES.VarBinary, Buffer.alloc(10000, 0xAB), { length: Infinity }), 'ab'.repeat(10000));
    });
  });

  it('does not encrypt `null` values', function() {
    for (const [type, parameterOptions] of [[TYPES.Int], [TYPES.NVarChar, { length: 50 }], [TYPES.VarBinary, { length: Infinity }], [TYPES.DateTime2, { scale: 3 }]] as const) {
      const encrypted = encrypt(type, null, parameterOptions);

      assert.isTrue(encrypted.encrypted);
      assert.isNull(encrypted.data.value);
    }
  });

  it('uses deterministic or randomized encryption as the server asks for', function() {
    const parameters = [parameter('deterministic', TYPES.Int, 42), parameter('randomized', TYPES.Int, 42)];
    const resolved = parameters.map((parameter) => resolveParameter(parameter, collation, options));
    const metadata: ParameterEncryptionMetadata = {
      keys: [],
      parameters: new Map([
        ['deterministic', { key: createKey(), algorithmId: 2, encryptionType: 1, normalizationRuleVersion: 1 }],
        ['randomized', { key: createKey(), algorithmId: 2, encryptionType: 2, normalizationRuleVersion: 1 }]
      ])
    };

    const first = encryptParameters(parameters, resolved, metadata, new Map(), options);
    const second = encryptParameters(parameters, resolved, metadata, new Map(), options);

    assert.deepEqual(first[0].data.value, second[0].data.value);
    assert.notDeepEqual(first[1].data.value, second[1].data.value);

    assert.deepEqual(first[0].data.value, cipher.encrypt(Buffer.from('2a00000000000000', 'hex'), true));
    assert.strictEqual(cipher.decrypt(first[1].data.value).toString('hex'), '2a00000000000000');
  });

  it('only encrypts the parameters the server expects to be encrypted', function() {
    const parameters = [parameter('id', TYPES.Int, 1), parameter('secret', TYPES.NVarChar, 'secret'), parameter('plain', TYPES.NVarChar, 'plain')];
    const resolved = parameters.map((parameter) => resolveParameter(parameter, collation, options));
    const metadata: ParameterEncryptionMetadata = {
      keys: [],
      parameters: new Map([['secret', { key: createKey(), algorithmId: 2, encryptionType: 2, normalizationRuleVersion: 1 }]])
    };

    const encrypted = encryptParameters(parameters, resolved, metadata, new Map(), options);

    assert.strictEqual(encrypted[0], resolved[0]);
    assert.strictEqual(encrypted[2], resolved[2]);

    assert.strictEqual(encrypted[1].name, 'secret');
    assert.isFalse(encrypted[1].output);
    assert.isTrue(encrypted[1].encrypted);
    assert.strictEqual(encrypted[1].type.name, 'EncryptedValue');
    assert.strictEqual(cipher.decrypt(encrypted[1].data.value).toString('ucs2'), 'secret');

    // The parameters of the request are left as they are.
    assert.strictEqual(parameters[1].value, 'secret');
    assert.strictEqual(resolved[1].data.value, 'secret');
  });

  it('collects the ciphers of encrypted output parameters', function() {
    const parameters = [parameter('in', TYPES.Int, 1), parameter('out', TYPES.Int, null, { output: true }), parameter('plain', TYPES.Int, null, { output: true })];
    const resolved = parameters.map((parameter) => resolveParameter(parameter, collation, options));
    const metadata: ParameterEncryptionMetadata = {
      keys: [],
      parameters: new Map([
        ['in', { key: createKey(), algorithmId: 2, encryptionType: 2, normalizationRuleVersion: 1 }],
        ['out', { key: createKey(), algorithmId: 2, encryptionType: 2, normalizationRuleVersion: 1 }]
      ])
    };

    const ciphers = new Map();
    const encrypted = encryptParameters(parameters, resolved, metadata, ciphers, options);

    assert.isTrue(encrypted[1].output);
    assert.deepEqual(Array.from(ciphers), [['out', cipher]]);
  });

  describe('fails', function() {
    function metadataWith(overrides = {}): ParameterEncryptionMetadata {
      return {
        keys: [],
        parameters: new Map([['value', { key: createKey(), algorithmId: 2, encryptionType: 1, normalizationRuleVersion: 1, ...overrides }]])
      };
    }

    function encryptWith(parameters: Parameter[], metadata: ParameterEncryptionMetadata) {
      return encryptParameters(parameters, parameters.map((parameter) => resolveParameter(parameter, collation, options)), metadata, new Map(), options);
    }

    it('for parameters that are required to be encrypted, but not expected to be by the server', function() {
      assert.throws(() => {
        encryptWith([parameter('value', TYPES.Int, 1), parameter('other', TYPES.Int, 1, { forceEncrypt: true })], metadataWith());
      }, 'The parameter "other" is required to be encrypted (`forceEncrypt`), but the server does not expect it to be encrypted.');

      // ... and not for those that are encrypted.
      assert.isTrue(encryptWith([parameter('value', TYPES.Int, 1, { forceEncrypt: true })], metadataWith())[0].encrypted);
    });

    it('for types that can not be encrypted', function() {
      for (const [type, value] of [[TYPES.Text, 'text'], [TYPES.NText, 'text'], [TYPES.Image, Buffer.alloc(1)]] as const) {
        assert.throws(() => {
          encryptWith([parameter('value', type, value)], metadataWith());
        }, `Failed to encrypt the parameter "value": Values of type ${type.name} can not be encrypted.`);
      }
    });

    it('for values that are read from a stream', function() {
      for (const [type, value] of [[TYPES.VarBinary, Readable.from([Buffer.alloc(1)])], [TYPES.NVarChar, Readable.from(['a'])], [TYPES.VarChar, Readable.from(['a'])]] as const) {
        assert.throws(() => {
          encryptWith([parameter('value', type, value)], metadataWith());
        }, 'Failed to encrypt the parameter "value": Values that are read from a stream can not be encrypted.');
      }
    });

    it('for unsupported encryption algorithms and normalization rules', function() {
      assert.throws(() => {
        encryptWith([parameter('value', TYPES.Int, 1)], metadataWith({ algorithmId: 3 }));
      }, 'Failed to encrypt the parameter "value": Unsupported column encryption algorithm 3, only "AEAD_AES_256_CBC_HMAC_SHA256" is supported.');

      assert.throws(() => {
        encryptWith([parameter('value', TYPES.Int, 1)], metadataWith({ normalizationRuleVersion: 2 }));
      }, 'Failed to encrypt the parameter "value": Unsupported column encryption normalization rule version 2, only version 1 is supported.');
    });

    it('with the original error as its cause', function() {
      try {
        encryptWith([parameter('value', TYPES.Text, 'text')], metadataWith());
      } catch (error: any) {
        assert.strictEqual(error.cause.message, 'Values of type Text can not be encrypted.');
        return;
      }

      assert.fail('expected an error');
    });
  });

  describe('serialization', function() {
    // The description of how a value was encrypted, which follows it.
    const cipherInfo = (baseTypeInfo: string, encryptionType = '01') => {
      return baseTypeInfo +
        '02' + // algorithm
        encryptionType +
        '05000000' + // database id
        '04030201' + // key id
        '02000000' + // key version
        '1122334455667788' + // key metadata version
        '01'; // normalization rule version
    };

    // The type of an encrypted value, and the header and trailer of a value
    // of that type.
    const VARBINARY_MAX = 'a5ffff';
    const UNKNOWN_PLP_LENGTH = 'feffffffffffffff';
    const PLP_NULL = 'ffffffffffffffff';
    const PLP_TERMINATOR = '00000000';

    it('sends an encrypted parameter as a `varbinary(max)` value, followed by how it was encrypted', async function() {
      const encrypted = encrypt(TYPES.Int, 42);
      const ciphertext = cipher.encrypt(Buffer.from('2a00000000000000', 'hex'), true);

      const expected = new WritableTrackingBuffer();
      expected.writeBVarchar('@value', 'ucs2');
      expected.writeUInt8(0x08); // fEncrypted
      expected.writeBuffer(Buffer.from(VARBINARY_MAX + UNKNOWN_PLP_LENGTH, 'hex'));
      expected.writeUInt32LE(ciphertext.length);
      expected.writeBuffer(ciphertext);
      expected.writeBuffer(Buffer.from(PLP_TERMINATOR + cipherInfo('2604'), 'hex')); // INTN, 4 bytes

      assert.strictEqual((await payload([encrypted])).toString('hex'), expected.data.toString('hex'));
    });

    it('sends an encrypted output parameter by reference', async function() {
      const parameters = [parameter('value', TYPES.Int, null, { output: true })];
      const resolved = parameters.map((parameter) => resolveParameter(parameter, collation, options));
      const metadata: ParameterEncryptionMetadata = {
        keys: [],
        parameters: new Map([['value', { key: createKey(), algorithmId: 2, encryptionType: 2, normalizationRuleVersion: 1 }]])
      };

      const expected = new WritableTrackingBuffer();
      expected.writeBVarchar('@value', 'ucs2');
      expected.writeUInt8(0x09); // fByRefValue | fEncrypted
      expected.writeBuffer(Buffer.from(VARBINARY_MAX + PLP_NULL + cipherInfo('2604', '02'), 'hex'));

      assert.strictEqual((await payload(encryptParameters(parameters, resolved, metadata, new Map(), options))).toString('hex'), expected.data.toString('hex'));
    });

    it('sends large encrypted values', async function() {
      const value = Buffer.alloc(20000, 0xAB);
      const ciphertext = cipher.encrypt(value, true);

      const expected = new WritableTrackingBuffer();
      expected.writeBVarchar('@value', 'ucs2');
      expected.writeUInt8(0x08);
      expected.writeBuffer(Buffer.from(VARBINARY_MAX + UNKNOWN_PLP_LENGTH, 'hex'));
      expected.writeUInt32LE(ciphertext.length);
      expected.writeBuffer(ciphertext);
      expected.writeBuffer(Buffer.from(PLP_TERMINATOR + cipherInfo(VARBINARY_MAX), 'hex'));

      assert.strictEqual((await payload([encrypt(TYPES.VarBinary, value, { length: Infinity })])).toString('hex'), expected.data.toString('hex'));
    });

    it('describes the type of the encrypted value by the type of the parameter', function() {
      const collationBytes = '0904d00034';

      const typeInfo = (type: DataType, value: unknown, parameterOptions?: ParameterOptions) => {
        const { cipherInfo } = encrypt(type, value, parameterOptions).data as unknown as { cipherInfo: Buffer };
        return cipherInfo.subarray(0, cipherInfo.length - 23).toString('hex');
      };

      assert.strictEqual(typeInfo(TYPES.Bit, true), '6801');
      assert.strictEqual(typeInfo(TYPES.TinyInt, 1), '2601');
      assert.strictEqual(typeInfo(TYPES.SmallInt, 1), '2602');
      assert.strictEqual(typeInfo(TYPES.BigInt, 1), '2608');
      assert.strictEqual(typeInfo(TYPES.Real, 1), '6d04');
      assert.strictEqual(typeInfo(TYPES.Float, 1), '6d08');
      assert.strictEqual(typeInfo(TYPES.SmallMoney, 1), '6e04');
      assert.strictEqual(typeInfo(TYPES.Money, 1), '6e08');
      assert.strictEqual(typeInfo(TYPES.Decimal, 1, { precision: 18, scale: 4 }), '6a091204');
      assert.strictEqual(typeInfo(TYPES.Numeric, 1, { precision: 38, scale: 10 }), '6c11260a');
      assert.strictEqual(typeInfo(TYPES.UniqueIdentifier, '01234567-89AB-CDEF-0123-456789ABCDEF'), '2410');
      assert.strictEqual(typeInfo(TYPES.Date, new Date()), '28');
      assert.strictEqual(typeInfo(TYPES.Time, new Date(), { scale: 3 }), '2903');
      assert.strictEqual(typeInfo(TYPES.DateTime2, new Date(), { scale: 7 }), '2a07');
      assert.strictEqual(typeInfo(TYPES.DateTimeOffset, new Date(), { scale: 0 }), '2b00');
      assert.strictEqual(typeInfo(TYPES.DateTime, new Date()), '6f08');
      assert.strictEqual(typeInfo(TYPES.SmallDateTime, new Date()), '6f04');
      assert.strictEqual(typeInfo(TYPES.VarChar, 'abc', { length: 50 }), 'a73200' + collationBytes);
      assert.strictEqual(typeInfo(TYPES.VarChar, 'abc', { length: Infinity }), 'a7ffff' + collationBytes);
      assert.strictEqual(typeInfo(TYPES.Char, 'abc', { length: 10 }), 'af0a00' + collationBytes);
      assert.strictEqual(typeInfo(TYPES.NVarChar, 'abc', { length: 50 }), 'e76400' + collationBytes);
      assert.strictEqual(typeInfo(TYPES.NVarChar, 'abc', { length: Infinity }), 'e7ffff' + collationBytes);
      assert.strictEqual(typeInfo(TYPES.NChar, 'abc', { length: 10 }), 'ef1400' + collationBytes);
      assert.strictEqual(typeInfo(TYPES.VarBinary, Buffer.alloc(1), { length: 50 }), 'a53200');
      assert.strictEqual(typeInfo(TYPES.VarBinary, Buffer.alloc(1), { length: Infinity }), 'a5ffff');
      assert.strictEqual(typeInfo(TYPES.Binary, Buffer.alloc(1), { length: 10 }), 'ad0a00');
    });
  });
});

describe('describeStatement', function() {
  const SP_EXECUTESQL = 10;

  function requestWith(sql: string, configure: (request: Request) => void = () => {}) {
    const request = new Request(sql, () => {});
    configure(request);
    return request;
  }

  it('describes the statement of a request with the declarations of its parameters', function() {
    const request = requestWith('SELECT * FROM patients WHERE ssn = @ssn AND id > @id', (request) => {
      request.addParameter('ssn', TYPES.Char, '795-73-9838', { length: 11 });
      request.addParameter('id', TYPES.Int, 1);
    });

    assert.deepEqual(describeStatement(request, SP_EXECUTESQL), {
      statement: 'SELECT * FROM patients WHERE ssn = @ssn AND id > @id',
      declarations: '@ssn char(11), @id int',
      signature: '@ssn Char, @id Int'
    });
  });

  it('gives statements the same signature whatever the values of their parameters are', function() {
    const signature = (name: string | null, amount: number | null, at: Date | null) => {
      const request = requestWith('UPDATE accounts SET name = @name, amount = @amount, at = @at', (request) => {
        request.addParameter('name', TYPES.NVarChar, name);
        request.addParameter('amount', TYPES.Decimal, amount);
        request.addParameter('at', TYPES.DateTime2, at);
      });

      return describeStatement(request, SP_EXECUTESQL)!;
    };

    const short = signature('a', 1, new Date());
    const long = signature('a'.repeat(5000), 1, new Date());
    const empty = signature(null, null, null);

    // The values make for different declarations ...
    assert.strictEqual(short.declarations, '@name nvarchar(1), @amount decimal(18, 0), @at datetime2(7)');
    assert.strictEqual(long.declarations, '@name nvarchar(max), @amount decimal(18, 0), @at datetime2(7)');
    assert.strictEqual(empty.declarations, '@name nvarchar(1), @amount decimal(1, 0), @at datetime2(0)');

    // ... of the same parameters.
    assert.strictEqual(short.signature, '@name NVarChar, @amount Decimal, @at DateTime2');
    assert.strictEqual(long.signature, short.signature);
    assert.strictEqual(empty.signature, short.signature);
  });

  it('describes the call of a stored procedure', function() {
    const request = requestWith('dbo.proc', (request) => {
      request.addParameter('id', TYPES.Int, 1);
      request.addParameter('name', TYPES.NVarChar, 'name');
      request.addOutputParameter('result', TYPES.Int);
    });

    assert.deepEqual(describeStatement(request, 'dbo.proc'), {
      statement: 'EXEC dbo.proc @id=@id, @name=@name, @result=@result OUTPUT',
      declarations: '@id int, @name nvarchar(4), @result int OUTPUT',
      signature: '@id Int, @name NVarChar, @result Int OUTPUT'
    });
  });

  it('leaves table-valued parameters out of the call of a stored procedure', function() {
    // The type of a table-valued parameter does not have to be named to
    // call a procedure.
    const request = requestWith('dbo.proc', (request) => {
      request.addParameter('rows', TYPES.TVP, { columns: [{ name: 'a', type: TYPES.Int }], rows: [[1]] });
      request.addParameter('id', TYPES.Int, 1);
    });

    assert.deepEqual(describeStatement(request, 'dbo.proc'), {
      statement: 'EXEC dbo.proc @id=@id',
      declarations: '@id int',
      signature: '@id Int'
    });
  });

  it('keeps table-valued parameters in the declarations of a statement that uses them', function() {
    const request = requestWith('SELECT a FROM @rows WHERE a > @id', (request) => {
      request.addParameter('rows', TYPES.TVP, { name: 'IntTable', schema: 'dbo', columns: [{ name: 'a', type: TYPES.Int }], rows: [[1]] });
      request.addParameter('id', TYPES.Int, 1);
    });

    assert.deepEqual(describeStatement(request, SP_EXECUTESQL), {
      statement: 'SELECT a FROM @rows WHERE a > @id',
      declarations: '@rows dbo.IntTable readonly, @id int',
      signature: '@rows TVP, @id Int'
    });
  });

  it('describes nothing if there are no parameters that could be encrypted', function() {
    assert.isUndefined(describeStatement(requestWith('SELECT 1'), SP_EXECUTESQL));
    assert.isUndefined(describeStatement(requestWith('dbo.proc'), 'dbo.proc'));

    const request = requestWith('dbo.proc', (request) => {
      request.addParameter('rows', TYPES.TVP, { columns: [{ name: 'a', type: TYPES.Int }], rows: [[1]] });
    });
    assert.isUndefined(describeStatement(request, 'dbo.proc'));
  });
});

describe('readParameterEncryptionMetadata', function() {
  const encryptedKey = Buffer.from('010203', 'hex');
  const rotatedEncryptedKey = Buffer.from('040506', 'hex');
  const metadataVersion = Buffer.from('1122334455667788', 'hex');

  const keyRows = [
    [1, 5, 7, 1, metadataVersion, encryptedKey, 'AZURE_KEY_VAULT', 'https://tedious.vault.azure.net/keys/cmk/1', 'RSA_OAEP'],
    [1, 5, 7, 1, metadataVersion, rotatedEncryptedKey, 'AZURE_KEY_VAULT', 'https://tedious.vault.azure.net/keys/cmk/2', 'RSA_OAEP'],
    [2, 5, 8, 1, metadataVersion, encryptedKey, 'CUSTOM', 'key/1', 'RSA_OAEP']
  ];

  const parameterRows = [
    [1, '@id', 0, 0, 0, 0],
    [2, '@deterministic', 2, 1, 1, 1],
    [3, '@randomized', 2, 2, 2, 1]
  ];

  const asColumns = (row: unknown[]) => row.map((value) => ({ value }));

  function read(resultSets: unknown[][][], toRow: (row: unknown[]) => any = asColumns) {
    return readParameterEncryptionMetadata(resultSets.map((rows) => rows.map(toRow)));
  }

  it('reads how the parameters of a statement need to be encrypted', function() {
    const { keys, parameters } = read([keyRows, parameterRows]);

    assert.deepEqual(keys, [
      {
        databaseId: 5,
        keyId: 7,
        keyVersion: 1,
        metadataVersion,
        values: [
          { encryptedKey, keyStoreName: 'AZURE_KEY_VAULT', keyPath: 'https://tedious.vault.azure.net/keys/cmk/1', algorithm: 'RSA_OAEP' },
          { encryptedKey: rotatedEncryptedKey, keyStoreName: 'AZURE_KEY_VAULT', keyPath: 'https://tedious.vault.azure.net/keys/cmk/2', algorithm: 'RSA_OAEP' }
        ],
        cipher: undefined
      },
      {
        databaseId: 5,
        keyId: 8,
        keyVersion: 1,
        metadataVersion,
        values: [{ encryptedKey, keyStoreName: 'CUSTOM', keyPath: 'key/1', algorithm: 'RSA_OAEP' }],
        cipher: undefined
      }
    ]);

    // Only the parameters that need to be encrypted, without the `@`
    assert.deepEqual(Array.from(parameters.keys()), ['deterministic', 'randomized']);
    assert.deepEqual(parameters.get('deterministic'), { key: keys[0], algorithmId: 2, encryptionType: 1, normalizationRuleVersion: 1 });
    assert.deepEqual(parameters.get('randomized'), { key: keys[1], algorithmId: 2, encryptionType: 2, normalizationRuleVersion: 1 });
  });

  it('reads the response for a statement without encrypted parameters', function() {
    const { keys, parameters } = read([[], [[1, '@id', 0, 0, 0, 0]]]);

    assert.deepEqual(keys, []);
    assert.strictEqual(parameters.size, 0);
  });

  it('reads rows of connections that use the `useColumnNames` option', function() {
    // The names of the columns are subject to the options of the connection.
    const { keys, parameters } = read([keyRows, parameterRows], (row) => {
      return Object.fromEntries(row.map((value, index) => [`renamed_${index}`, { value }]));
    });

    assert.lengthOf(keys, 2);
    assert.deepEqual(parameters.get('deterministic'), { key: keys[0], algorithmId: 2, encryptionType: 1, normalizationRuleVersion: 1 });
  });

  it('fails if a result set is missing', function() {
    assert.throws(() => read([]), 'Unexpected response from sp_describe_parameter_encryption.');
    assert.throws(() => read([keyRows]), 'Unexpected response from sp_describe_parameter_encryption.');
  });

  it('fails if the values of a row are not what they are expected to be', function() {
    const keyRow: unknown[] = keyRows[0];
    const parameterRow: unknown[] = parameterRows[1];

    // Each value of a row in turn, replaced by `null` and by a value of
    // another type.
    for (const invalid of [null, {}]) {
      for (let index = 0; index < keyRow.length; index++) {
        assert.throws(() => {
          read([[keyRow.with(index, invalid)], parameterRows]);
        }, 'Unexpected response from sp_describe_parameter_encryption.', `key column ${index}`);
      }

      for (let index = 1; index < parameterRow.length; index++) {
        assert.throws(() => {
          read([keyRows, [parameterRow.with(index, invalid)]]);
        }, 'Unexpected response from sp_describe_parameter_encryption.', `parameter column ${index}`);
      }
    }

    assert.throws(() => read([[[]], parameterRows]), 'Unexpected response from sp_describe_parameter_encryption.');
    assert.throws(() => read([keyRows, [[]]]), 'Unexpected response from sp_describe_parameter_encryption.');
  });

  it('fails if the key of a parameter is missing', function() {
    assert.throws(() => {
      read([keyRows, [[1, '@secret', 2, 1, 3, 1]]]);
    }, 'Unexpected response from sp_describe_parameter_encryption: the column encryption key of the parameter "@secret" is missing.');
  });
});

describe('createDescribeRequest', function() {
  it('creates a request that calls `sp_describe_parameter_encryption` with the statement and its parameters', function() {
    const request = createDescribeRequest({ statement: 'SELECT @id', declarations: '@id int' }, () => {});

    assert.strictEqual(request.sqlTextOrProcedure, 'sp_describe_parameter_encryption');
    assert.deepEqual(request.parameters.map(({ name, type, value }) => [name, type.name, value]), [
      ['tsql', 'NVarChar', 'SELECT @id'],
      ['params', 'NVarChar', '@id int']
    ]);

    // Its own parameters are not to be encrypted.
    assert.strictEqual(request.columnEncryption, 'resultSetOnly');
  });

  it('reads the parameter encryption metadata from the rows of the response', function() {
    let result: [Error | null | undefined, ParameterEncryptionMetadata | undefined] | undefined;
    const request = createDescribeRequest({ statement: 'SELECT @id, @secret', declarations: '@id int, @secret int' }, (error, metadata) => {
      result = [error, metadata];
    });

    request.emit('columnMetadata', []);
    request.emit('row', [1, 5, 7, 1, Buffer.alloc(8), Buffer.alloc(3), 'CUSTOM', 'key/1', 'RSA_OAEP'].map((value) => ({ value })));
    request.emit('columnMetadata', []);
    request.emit('row', [1, '@id', 0, 0, 0, 0].map((value) => ({ value })));
    request.emit('row', [2, '@secret', 2, 1, 1, 1].map((value) => ({ value })));
    request.callback(null);

    const [error, metadata] = result!;
    assert.isNull(error);
    assert.lengthOf(metadata!.keys, 1);
    assert.deepEqual(Array.from(metadata!.parameters.keys()), ['secret']);
  });

  it('passes on the error of a failed request', function() {
    let result: [Error | null | undefined, ParameterEncryptionMetadata | undefined] | undefined;
    const request = createDescribeRequest({ statement: 'SELECT @id', declarations: '@id int' }, (error, metadata) => {
      result = [error, metadata];
    });

    const error = new Error('Invalid object name');
    request.callback(error);

    assert.deepEqual(result, [error, undefined]);
  });

  it('fails if the response is not the expected one', function() {
    let result: [Error | null | undefined, ParameterEncryptionMetadata | undefined] | undefined;
    const request = createDescribeRequest({ statement: 'SELECT @id', declarations: '@id int' }, (error, metadata) => {
      result = [error, metadata];
    });

    request.callback(null);

    assert.instanceOf(result![0], RequestError);
    assert.strictEqual((result![0] as RequestError).code, 'ECOLUMNENCRYPTION');
    assert.strictEqual(result![0]!.message, 'Unexpected response from sp_describe_parameter_encryption.');
  });
});

describe('ParameterEncryptionMetadataCache', function() {
  const metadata = (): ParameterEncryptionMetadata => ({ keys: [], parameters: new Map() });

  it('distinguishes statements by their text and parameters', function() {
    const cache = new ParameterEncryptionMetadataCache(10);

    const first = metadata();
    const second = metadata();

    const key = (statement: string, signature: string) => ParameterEncryptionMetadataCache.key({ statement, signature });

    cache.set(key('SELECT @a', '@a Int'), first);
    cache.set(key('SELECT @a', '@a BigInt'), second);

    assert.strictEqual(cache.get(key('SELECT @a', '@a Int')), first);
    assert.strictEqual(cache.get(key('SELECT @a', '@a BigInt')), second);
    assert.isUndefined(cache.get(key('SELECT @b', '@a Int')));
  });

  it('evicts the least recently used statement once it is full', function() {
    const cache = new ParameterEncryptionMetadataCache(2);

    cache.set('a', metadata());
    cache.set('b', metadata());

    // `a` is used, which leaves `b` as the least recently used.
    assert.isDefined(cache.get('a'));
    cache.set('c', metadata());

    assert.isDefined(cache.get('a'));
    assert.isUndefined(cache.get('b'));
    assert.isDefined(cache.get('c'));
  });

  it('replaces the metadata of a statement', function() {
    const cache = new ParameterEncryptionMetadataCache(2);
    const replacement = metadata();

    cache.set('a', metadata());
    cache.set('b', metadata());
    cache.set('a', replacement);

    assert.strictEqual(cache.get('a'), replacement);
    assert.isDefined(cache.get('b'));
  });

  it('forgets statements', function() {
    const cache = new ParameterEncryptionMetadataCache(10);

    cache.set('a', metadata());
    cache.set('b', metadata());

    cache.delete('a');
    assert.isUndefined(cache.get('a'));
    assert.isDefined(cache.get('b'));

    cache.clear();
    assert.isUndefined(cache.get('b'));
  });
});
