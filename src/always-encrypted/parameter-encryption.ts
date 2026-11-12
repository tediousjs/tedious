import { ColumnEncryptionCipher } from './cipher';
import { assertSupportedEncryption } from './key-cache';
import { type ColumnEncryptionKeyInfo } from './types';
import { type InternalConnectionOptions } from '../connection';
import { typeByName as TYPES, type DataType, type Parameter, type ParameterData, type ResolvedParameter } from '../data-type';
import VarBinary from '../data-types/varbinary';
import { timeLength } from '../data-types/temporal';
import { RequestError } from '../errors';
import Request from '../request';
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

/**
 * A row as it is emitted by a request: an array of its columns, or an
 * object of its columns by name (with the `useColumnNames` option).
 */
type Row = Column[] | { [name: string]: Column };

/**
 * What `sp_describe_parameter_encryption` is asked to describe.
 */
export interface DescribedStatement {
  statement: string;

  /**
   * The declarations of the statement's parameters, as they are passed to
   * `sp_executesql`.
   */
  declarations: string;

  /**
   * The names of the statement's parameters, in an order that does not
   * depend on the order they were added in.
   *
   * Together with the statement, this is what the server's answer is
   * remembered by. How the parameters are declared does not change the
   * answer, only whether the server accepts the statement at all - and
   * lengths that are not specified are those of the values, so the server
   * would be asked again for each length of a string.
   *
   * The names are needed, though: they are not given by the statement
   * (`@Name` is the `@name` of a statement to a server that ignores case),
   * and a parameter that the answer does not cover is sent as it is.
   */
  parameterNames: string;
}

/**
 * Builds the statement that describes the request: the statement that is
 * executed with the parameters of the request, or the call of the stored
 * procedure. Returns `undefined` if none of the parameters can be encrypted.
 *
 * @param procedure
 *   The name of the stored procedure that is called with the parameters, or
 *   the id of the procedure (like `sp_executesql`) that executes the
 *   statement of the request.
 */
export function describeStatement(request: Request, procedure: string | number): DescribedStatement | undefined {
  if (typeof procedure === 'number') {
    if (request.parameters.length === 0) {
      return undefined;
    }

    return describedStatement(request, request.sqlTextOrProcedure!, request.parameters);
  }

  // Table-valued parameters are left out of the call: they can not be
  // encrypted, and their type (which a declaration requires) does not have
  // to be specified to call a procedure.
  const parameters = request.parameters.filter((parameter) => parameter.type !== TYPES.TVP);
  if (parameters.length === 0) {
    return undefined;
  }

  const args = parameters.map((parameter) => {
    return `@${parameter.name}=@${parameter.name}${parameter.output ? ' OUTPUT' : ''}`;
  });

  return describedStatement(request, `EXEC ${procedure} ${args.join(', ')}`, parameters);
}

function describedStatement(request: Request, statement: string, parameters: Parameter[]): DescribedStatement {
  const parameterNames = parameters.map((parameter) => `@${parameter.name}`).sort().join(', ');

  return { statement, declarations: request.makeParamsParameter(parameters), parameterNames };
}

/**
 * Creates the request that asks the server how the parameters of a
 * statement need to be encrypted.
 */
export function createDescribeRequest({ statement, declarations }: Pick<DescribedStatement, 'statement' | 'declarations'>, callback: (error: Error | null | undefined, metadata?: ParameterEncryptionMetadata) => void): Request {
  const resultSets: Row[][] = [];

  // The result sets do not contain any encrypted values, and the parameters
  // of this request itself are not encrypted.
  const request = new Request('sp_describe_parameter_encryption', (error) => {
    if (error) {
      return callback(error);
    }

    let metadata;
    try {
      metadata = readParameterEncryptionMetadata(resultSets);
    } catch (error: any) {
      return callback(new RequestError(error.message, 'ECOLUMNENCRYPTION', { cause: error }));
    }

    callback(null, metadata);
  }, { columnEncryption: 'resultSetOnly' });

  request.addParameter('tsql', TYPES.NVarChar, statement);
  request.addParameter('params', TYPES.NVarChar, declarations);

  request.on('columnMetadata', () => {
    resultSets.push([]);
  });

  request.on('row', (row: Row) => {
    resultSets[resultSets.length - 1].push(row);
  });

  return request;
}

/**
 * Reads the two result sets that `sp_describe_parameter_encryption`
 * returns: the column encryption keys, and how each parameter is encrypted.
 */
export function readParameterEncryptionMetadata(resultSets: Row[][]): ParameterEncryptionMetadata {
  if (resultSets.length < 2) {
    throw new Error('Unexpected response from sp_describe_parameter_encryption.');
  }

  // Columns are read by position, as the names of columns depend on the
  // options of the connection.
  const [keyRows, parameterRows] = resultSets.map((rows) => {
    return rows.map((row) => (Array.isArray(row) ? row : Object.values(row)).map((column) => column.value));
  });

  // A key has one row per column master key that protects it.
  const keysByOrdinal = new Map<number, ColumnEncryptionKeyInfo>();
  for (const [ordinal, databaseId, keyId, keyVersion, metadataVersion, encryptedKey, keyStoreName, keyPath, algorithm] of keyRows) {
    assertTypes([ordinal, databaseId, keyId, keyVersion], 'number');
    assertTypes([keyStoreName, keyPath, algorithm], 'string');
    assertTypes([metadataVersion, encryptedKey], 'buffer');

    let key = keysByOrdinal.get(ordinal);
    if (key === undefined) {
      key = { databaseId, keyId, keyVersion, metadataVersion, values: [], cipher: undefined };
      keysByOrdinal.set(ordinal, key);
    }

    key.values.push({ encryptedKey, keyStoreName, keyPath, algorithm });
  }

  const parameters = new Map<string, ParameterCryptoMetadata>();
  for (const [/* ordinal */, name, algorithmId, encryptionType, keyOrdinal, normalizationRuleVersion] of parameterRows) {
    assertTypes([name], 'string');
    assertTypes([algorithmId, encryptionType, keyOrdinal, normalizationRuleVersion], 'number');

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

/**
 * The response is what the server makes of it: checks that its values are
 * what the rest of the code relies on them to be.
 */
function assertTypes(values: unknown[], type: 'number' | 'string' | 'buffer') {
  for (const value of values) {
    if (type === 'buffer' ? !Buffer.isBuffer(value) : typeof value !== type) {
      throw new Error('Unexpected response from sp_describe_parameter_encryption.');
    }
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

  static key({ statement, parameterNames }: Pick<DescribedStatement, 'statement' | 'parameterNames'>): string {
    return `${statement}\n${parameterNames}`;
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
      assertSupportedEncryption(cryptoMetadata);

      const cipher = cryptoMetadata.key.cipher!;
      if (resolved.output) {
        ciphers.set(resolved.name, cipher);
      }

      return encryptParameter(withDeclaredLength(resolved, parameters[index]), cryptoMetadata, cipher, options);
    } catch (error: any) {
      throw new Error(`Failed to encrypt the parameter "${resolved.name}": ${error.message}`, { cause: error });
    }
  });
}

/**
 * The server is told the type of each value that was encrypted, which has
 * to fit the column like the type that the parameter is declared with does.
 *
 * A `null` whose length is not specified is declared with a length of 1,
 * but resolved to the maximum length of its type - longer than most columns.
 */
function withDeclaredLength(resolved: ResolvedParameter, parameter: Parameter): ResolvedParameter {
  if (resolved.data.length === undefined || parameter.length || parameter.value !== null || parameter.output) {
    return resolved;
  }

  return { ...resolved, data: { ...resolved.data, length: 1 } };
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

  // Always sent as `varbinary(max)`: the length of an encrypted value differs
  // from the length of its type, and the encrypted value that is returned
  // for an output parameter must not be truncated to the declared length.
  const data: EncryptedParameterData = { value, length: MAX, cipherInfo: cipherInfo.data };

  return { name: parameter.name, output: parameter.output, type: EncryptedValue, data, encrypted: true };
}

interface EncryptedParameterData extends ParameterData<Buffer | null> {
  cipherInfo: Buffer;
}

/**
 * The type an encrypted parameter is sent as: a `varbinary(max)` that holds
 * the encrypted value, followed by the description of how it was encrypted.
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
      return truncate(toBuffer(data.value), data.length!, type, 1);

    case 'NChar':
    case 'NVarChar':
      return truncate(toBuffer(data.value), data.length!, type, 2);

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
 *
 * @param length
 *   The declared length of the type, in bytes or characters.
 *
 * @param unitLength
 *   The number of bytes per unit of length.
 */
function truncate(value: Buffer, length: number, type: DataType, unitLength: number): Buffer {
  const { maximumLength } = type as DataType & { maximumLength: number };

  // A `max` type
  if (length > maximumLength) {
    return value;
  }

  return value.length <= length * unitLength ? value : value.subarray(0, length * unitLength);
}
