import { ColumnEncryptionCipher } from './cipher';
import { assertSupportedAlgorithm } from './key-cache';
import { type ColumnEncryptionKeyInfo } from './types';
import { type InternalConnectionOptions } from '../connection';
import { type DataType, type Parameter, type ParameterData, type ResolvedParameter } from '../data-type';
import VarBinary from '../data-types/varbinary';
import { timeLength } from '../data-types/temporal';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const MAX = (1 << 16) - 1;

const ENCRYPTION_TYPE_PLAINTEXT = 0;
const ENCRYPTION_TYPE_DETERMINISTIC = 1;

/**
 * How the server expects a parameter to be encrypted.
 */
export interface ParameterCryptoMetadata {
  key: ColumnEncryptionKeyInfo;
  algorithmId: number;
  encryptionType: number;
  normalizationRuleVersion: number;
}

/**
 * What `sp_describe_parameter_encryption` reports for a statement: how each
 * of the parameters that target encrypted columns has to be encrypted.
 */
export interface ParameterEncryptionMetadata {
  keys: ColumnEncryptionKeyInfo[];

  /**
   * The parameters that need to be encrypted, by name (without the `@`).
   */
  parameters: Map<string, ParameterCryptoMetadata>;
}

interface Column {
  value: any;
}

type Row = Column[] | { [name: string]: Column };

/**
 * Builds the statement that `sp_describe_parameter_encryption` analyzes for
 * a call of a stored procedure.
 */
export function describeProcedureCall(procedure: string, parameters: Parameter[]): string {
  const args = parameters.map((parameter) => {
    return `@${parameter.name}=@${parameter.name}${parameter.output ? ' OUTPUT' : ''}`;
  });

  return `EXEC ${procedure} ${args.join(', ')}`;
}

/**
 * Collects the two result sets that `sp_describe_parameter_encryption`
 * returns: the column encryption keys, and how each parameter is encrypted.
 */
export class ParameterEncryptionMetadataReader {
  declare private resultSets: Row[][];

  constructor() {
    this.resultSets = [];
  }

  onColumnMetadata() {
    this.resultSets.push([]);
  }

  onRow(row: Row) {
    this.resultSets[this.resultSets.length - 1].push(row);
  }

  read(): ParameterEncryptionMetadata {
    if (this.resultSets.length < 2) {
      throw new Error('Unexpected response from sp_describe_parameter_encryption.');
    }

    // Columns are read by position, as the names of columns depend on the
    // options of the connection.
    const [keyRows, parameterRows] = this.resultSets.map((rows) => {
      return rows.map((row) => (Array.isArray(row) ? row : Object.values(row)).map((column) => column.value));
    });

    // A key has one row per column master key that protects it.
    const keysByOrdinal = new Map<number, ColumnEncryptionKeyInfo>();
    for (const [ordinal, databaseId, keyId, keyVersion, metadataVersion, encryptedKey, keyStoreName, keyPath, algorithm] of keyRows) {
      let key = keysByOrdinal.get(ordinal);
      if (key === undefined) {
        key = { databaseId, keyId, keyVersion, metadataVersion, values: [], cipher: undefined };
        keysByOrdinal.set(ordinal, key);
      }

      key.values.push({ encryptedKey, keyStoreName, keyPath, algorithm });
    }

    const parameters = new Map<string, ParameterCryptoMetadata>();
    for (const [/* ordinal */, name, algorithmId, encryptionType, keyOrdinal, normalizationRuleVersion] of parameterRows) {
      if (encryptionType === ENCRYPTION_TYPE_PLAINTEXT) {
        continue;
      }

      const key = keysByOrdinal.get(keyOrdinal);
      if (key === undefined) {
        throw new Error(`Unexpected response from sp_describe_parameter_encryption: the column encryption key of the parameter "${name}" is missing.`);
      }

      parameters.set(name.replace(/^@/, ''), { key, algorithmId, encryptionType, normalizationRuleVersion });
    }

    return { keys: Array.from(keysByOrdinal.values()), parameters };
  }
}

/**
 * Remembers the parameter encryption metadata of the most recently used
 * statements.
 */
export class ParameterEncryptionMetadataCache {
  declare private readonly maxSize: number;
  declare private readonly entries: Map<string, ParameterEncryptionMetadata>;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.entries = new Map();
  }

  static key(statement: string, parameters: string): string {
    return `${statement}\n${parameters}`;
  }

  get(key: string): ParameterEncryptionMetadata | undefined {
    const metadata = this.entries.get(key);

    // A `Map` iterates in insertion order: re-inserting an entry that is
    // used keeps the least recently used one first.
    if (metadata !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, metadata);
    }

    return metadata;
  }

  set(key: string, metadata: ParameterEncryptionMetadata) {
    this.entries.delete(key);
    this.entries.set(key, metadata);

    if (this.entries.size > this.maxSize) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }

  delete(key: string) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }
}

/**
 * Encrypts the parameters of a statement that the server expects to be
 * encrypted. The column encryption keys of `metadata` have to be loaded.
 *
 * @param ciphers
 *   Receives the cipher of each encrypted output parameter by name, which
 *   is what decrypts the value that is returned for it.
 */
export function encryptParameters(
  parameters: Parameter[],
  resolvedParameters: ResolvedParameter[],
  metadata: ParameterEncryptionMetadata,
  ciphers: Map<string, ColumnEncryptionCipher>,
  options: InternalConnectionOptions
): ResolvedParameter[] {
  return resolvedParameters.map((resolved, index) => {
    const cryptoMetadata = metadata.parameters.get(resolved.name);

    if (cryptoMetadata === undefined) {
      if (parameters[index].forceEncrypt) {
        throw new Error(`The parameter "${resolved.name}" is required to be encrypted (\`forceEncrypt\`), but the server does not expect it to be encrypted.`);
      }

      return resolved;
    }

    try {
      assertSupportedAlgorithm(cryptoMetadata.algorithmId, undefined);

      const cipher = cryptoMetadata.key.cipher!;
      if (resolved.output) {
        ciphers.set(resolved.name, cipher);
      }

      return encryptParameter(resolved, cryptoMetadata, cipher, options);
    } catch (error: any) {
      throw new Error(`Failed to encrypt the parameter "${resolved.name}": ${error.message}`, { cause: error });
    }
  });
}

function encryptParameter(parameter: ResolvedParameter, cryptoMetadata: ParameterCryptoMetadata, cipher: ColumnEncryptionCipher, options: InternalConnectionOptions): ResolvedParameter {
  const normalized = normalize(parameter, options);
  const value = normalized === null ? null : cipher.encrypt(normalized, cryptoMetadata.encryptionType === ENCRYPTION_TYPE_DETERMINISTIC);

  // The `ParamCipherInfo` that follows the value: the type of the value
  // that was encrypted, and how it was encrypted.
  const cipherInfo = new WritableTrackingBuffer();
  writeBaseTypeInfo(cipherInfo, parameter, options);
  cipherInfo.writeUInt8(cryptoMetadata.algorithmId);
  cipherInfo.writeUInt8(cryptoMetadata.encryptionType);
  cipherInfo.writeUInt32LE(cryptoMetadata.key.databaseId);
  cipherInfo.writeUInt32LE(cryptoMetadata.key.keyId);
  cipherInfo.writeUInt32LE(cryptoMetadata.key.keyVersion);
  cipherInfo.writeBuffer(cryptoMetadata.key.metadataVersion);
  cipherInfo.writeUInt8(cryptoMetadata.normalizationRuleVersion);

  const data: EncryptedParameterData = {
    value,
    length: value !== null && value.length > VarBinary.maximumLength ? MAX : VarBinary.maximumLength,
    cipherInfo: cipherInfo.data
  };

  return { name: parameter.name, output: parameter.output, type: EncryptedValue, data, encrypted: true };
}

interface EncryptedParameterData extends ParameterData<Buffer | null> {
  cipherInfo: Buffer;
}

/**
 * The type an encrypted parameter is sent as: a `varbinary` that holds the
 * encrypted value, followed by the description of how it was encrypted.
 */
const EncryptedValue: DataType = {
  id: VarBinary.id,
  type: VarBinary.type,
  name: 'EncryptedValue',

  declaration() {
    throw new Error('Encrypted values are declared as the type of the value that was encrypted.');
  },

  validate(value) {
    return value;
  },

  writeTypeInfo(buffer, parameter, options) {
    VarBinary.writeTypeInfo(buffer, parameter, options);
  },

  writeValue(buffer, parameter, options) {
    VarBinary.writeValue(buffer, parameter, options);
    buffer.writeBuffer((parameter as EncryptedParameterData).cipherInfo);
  }
};

/**
 * Writes the `TYPE_INFO` of the value that is encrypted.
 */
function writeBaseTypeInfo(buffer: WritableTrackingBuffer, parameter: ResolvedParameter, options: InternalConnectionOptions) {
  parameter.type.writeTypeInfo(buffer, parameter.data, options);
}

/**
 * Writes the value of a parameter in the format it is sent in if it is not
 * encrypted, without its length prefix.
 */
function writeValue(parameter: ResolvedParameter, options: InternalConnectionOptions): Buffer {
  const buffer = new WritableTrackingBuffer();
  parameter.type.writeValue(buffer, parameter.data, options);

  // All types that are normalized from this format prefix their values with
  // a length of one byte.
  return buffer.data.subarray(1);
}

/**
 * Normalizes the value of a parameter for encryption, see
 * `readNormalizedValue` for the format.
 */
function normalize(parameter: ResolvedParameter, options: InternalConnectionOptions): Buffer | null {
  const { type, data } = parameter;

  if (data.value == null) {
    return null;
  }

  switch (type.name) {
    case 'Bit':
    case 'TinyInt':
      return extendInteger(writeValue(parameter, options), false);

    case 'SmallInt':
    case 'Int':
    case 'BigInt':
      return extendInteger(writeValue(parameter, options), true);

    case 'SmallMoney': {
      // A `money` value consists of the high, then the low 32 bits.
      const value = writeValue(parameter, options).readInt32LE(0);

      const normalized = Buffer.alloc(8);
      normalized.writeInt32LE(value < 0 ? -1 : 0, 0);
      normalized.writeInt32LE(value, 4);
      return normalized;
    }

    case 'Real':
    case 'Float':
    case 'Money':
    case 'SmallDateTime':
    case 'DateTime':
    case 'Date':
    case 'UniqueIdentifier':
      return writeValue(parameter, options);

    case 'Decimal':
    case 'Numeric': {
      // The sign, followed by the magnitude.
      const normalized = Buffer.alloc(17);
      writeValue(parameter, options).copy(normalized);
      return normalized;
    }

    case 'Time':
    case 'DateTime2':
    case 'DateTimeOffset': {
      // The time, followed by the date and time zone offset (if any). The
      // time was rounded to the scale of the type, and keeps that precision.
      const value = writeValue(parameter, options);
      const length = timeLength(data.scale);

      const normalized = Buffer.alloc(5 + value.length - length);
      normalized.writeUIntLE(value.readUIntLE(0, length) * Math.pow(10, 7 - data.scale!), 0, 5);
      value.copy(normalized, 5, length);
      return normalized;
    }

    case 'Char':
    case 'VarChar':
    case 'Binary':
    case 'VarBinary':
      return truncate(toBuffer(data.value), data.length!, type);

    case 'NChar':
    case 'NVarChar':
      return truncate(toBuffer(data.value), data.length! * 2, type);

    default:
      throw new Error(`Values of type ${type.name} can not be encrypted.`);
  }
}

/**
 * Extends a little-endian integer to 64 bits.
 */
function extendInteger(value: Buffer, signed: boolean): Buffer {
  const negative = signed && (value[value.length - 1] & 0x80) !== 0;

  const normalized = Buffer.alloc(8, negative ? 0xFF : 0x00);
  value.copy(normalized);
  return normalized;
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return Buffer.from(value, 'ucs2');
  }

  throw new Error('Values that are read from a stream can not be encrypted.');
}

/**
 * The server truncates values that are longer than their declared type. It
 * can not do so for encrypted values, so that is taken care of here.
 */
function truncate(value: Buffer, length: number, type: DataType): Buffer {
  const { maximumLength } = type as DataType & { maximumLength: number };

  if (length > maximumLength || value.length <= length) {
    return value;
  }

  return value.subarray(0, length);
}
