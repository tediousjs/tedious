import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from './all-headers';
import { type Parameter, type ParameterData } from './data-type';
import { type InternalConnectionOptions } from './connection';
import { Collation } from './collation';
import { InputError } from './errors';
import VarBinary from './data-types/varbinary';

// const OPTION = {
//   WITH_RECOMPILE: 0x01,
//   NO_METADATA: 0x02,
//   REUSE_METADATA: 0x04
// };

const STATUS = {
  BY_REF_VALUE: 0x01,
  DEFAULT_VALUE: 0x02,
  ENCRYPTED: 0x08  // fEncrypted flag for Always Encrypted parameters
};

/*
  s2.2.6.5
 */
class RpcRequestPayload implements Iterable<Buffer> {
  declare procedure: string | number;
  declare parameters: Parameter[];

  declare options: InternalConnectionOptions;
  declare txnDescriptor: Buffer;
  declare collation: Collation | undefined;

  constructor(procedure: string | number, parameters: Parameter[], txnDescriptor: Buffer, options: InternalConnectionOptions, collation: Collation | undefined) {
    this.procedure = procedure;
    this.parameters = parameters;
    this.options = options;
    this.txnDescriptor = txnDescriptor;
    this.collation = collation;
  }

  [Symbol.iterator]() {
    return this.generateData();
  }

  * generateData() {
    const buffer = new WritableTrackingBuffer(500);
    if (this.options.tdsVersion >= '7_2') {
      const outstandingRequestCount = 1;
      writeToTrackingBuffer(buffer, this.txnDescriptor, outstandingRequestCount);
    }

    if (typeof this.procedure === 'string') {
      buffer.writeUsVarchar(this.procedure);
    } else {
      buffer.writeUShort(0xFFFF);
      buffer.writeUShort(this.procedure);
    }

    const optionFlags = 0;
    buffer.writeUInt16LE(optionFlags);
    yield buffer.data;

    const parametersLength = this.parameters.length;
    for (let i = 0; i < parametersLength; i++) {
      yield * this.generateParameterData(this.parameters[i]);
    }
  }

  toString(indent = '') {
    return indent + ('RPC Request - ' + this.procedure);
  }

  * generateParameterData(parameter: Parameter) {
    const buffer = new WritableTrackingBuffer(1 + 2 + Buffer.byteLength(parameter.name, 'ucs-2') + 1);

    if (parameter.name) {
      buffer.writeBVarchar('@' + parameter.name);
    } else {
      buffer.writeBVarchar('');
    }

    let statusFlags = 0;
    if (parameter.output) {
      statusFlags |= STATUS.BY_REF_VALUE;
    }
    // Set fEncrypted flag if parameter is encrypted (including NULL encrypted values)
    if (parameter.cryptoMetadata) {
      statusFlags |= STATUS.ENCRYPTED;
    }
    buffer.writeUInt8(statusFlags);

    yield buffer.data;

    // Handle encrypted parameters (including NULL encrypted values)
    if (parameter.cryptoMetadata) {
      yield * this.generateEncryptedParameterData(parameter);
      return;
    }

    const param: ParameterData = { value: parameter.value };

    const type = parameter.type;

    if ((type.id & 0x30) === 0x20) {
      if (parameter.length) {
        param.length = parameter.length;
      } else if (type.resolveLength) {
        param.length = type.resolveLength(parameter);
      }
    }

    if (parameter.precision) {
      param.precision = parameter.precision;
    } else if (type.resolvePrecision) {
      param.precision = type.resolvePrecision(parameter);
    }

    if (parameter.scale) {
      param.scale = parameter.scale;
    } else if (type.resolveScale) {
      param.scale = type.resolveScale(parameter);
    }

    if (this.collation) {
      param.collation = this.collation;
    }

    yield type.generateTypeInfo(param, this.options);
    yield type.generateParameterLength(param, this.options);
    try {
      yield * type.generateParameterData(param, this.options);
    } catch (error) {
      throw new InputError(`Input parameter '${parameter.name}' could not be validated`, { cause: error });
    }
  }

  /**
   * Generates parameter data for an encrypted parameter.
   *
   * Per MS-TDS spec, encrypted parameters are sent as:
   * 1. VarBinary type info (the ciphertext container type)
   * 2. VarBinary length and data (the encrypted value)
   * 3. ParamCipherInfo structure:
   *    - TYPE_INFO: Original parameter type info
   *    - EncryptionAlgo: BYTE (algorithm id, 2 = AEAD_AES_256_CBC_HMAC_SHA_256)
   *    - AlgoName: B_VARCHAR (only if EncryptionAlgo = 0)
   *    - EncryptionType: BYTE (1 = deterministic, 2 = randomized)
   *    - DatabaseId: ULONG (4 bytes)
   *    - CekId: ULONG (4 bytes)
   *    - CekVersion: ULONG (4 bytes)
   *    - CekMDVersion: ULONGLONG (8 bytes)
   *    - NormVersion: BYTE (must be 1)
   */
  * generateEncryptedParameterData(parameter: Parameter) {
    const encryptedValue = parameter.encryptedVal;
    const cryptoMetadata = parameter.cryptoMetadata!;
    const cekEntry = cryptoMetadata.cekEntry!;

    // 1. Create ParameterData for the encrypted value (as VarBinary)
    // For NULL values, encryptedValue will be undefined and we send a NULL VarBinary
    const encryptedParam: ParameterData = encryptedValue !== undefined ?
      { value: encryptedValue, length: encryptedValue.length } :
      { value: null, length: 8000 }; // Use max length for NULL so we get the short NULL marker

    // Send VarBinary type info, length, and data for the ciphertext
    yield VarBinary.generateTypeInfo(encryptedParam, this.options);
    yield VarBinary.generateParameterLength(encryptedParam, this.options);
    try {
      yield * VarBinary.generateParameterData(encryptedParam, this.options);
    } catch (error) {
      throw new InputError(`Encrypted parameter '${parameter.name}' could not be validated`, { cause: error });
    }

    // 2. Build ParamCipherInfo structure
    const cipherInfoBuffer = new WritableTrackingBuffer(50);

    // TYPE_INFO: Original parameter type info
    // For encrypted parameters, use baseTypeInfo from crypto metadata if available
    // This ensures the type info matches the column definition from the server
    const baseTypeInfo = cryptoMetadata.baseTypeInfo;
    const originalType = parameter.type;
    const originalParam: ParameterData = { value: parameter.value };

    if (baseTypeInfo) {
      // Use the type info from the server's metadata (available for decrypting column data)
      originalParam.length = baseTypeInfo.dataLength;
      originalParam.precision = baseTypeInfo.precision;
      originalParam.scale = baseTypeInfo.scale;
      originalParam.collation = baseTypeInfo.collation;
    } else {
      // Fall back to resolving from parameter
      if ((originalType.id & 0x30) === 0x20) {
        if (parameter.length) {
          originalParam.length = parameter.length;
        } else if (originalType.resolveLength) {
          originalParam.length = originalType.resolveLength(parameter);
        }
      }

      if (parameter.precision) {
        originalParam.precision = parameter.precision;
      } else if (originalType.resolvePrecision) {
        originalParam.precision = originalType.resolvePrecision(parameter);
      }

      if (parameter.scale) {
        originalParam.scale = parameter.scale;
      } else if (originalType.resolveScale) {
        originalParam.scale = originalType.resolveScale(parameter);
      }

      if (this.collation) {
        originalParam.collation = this.collation;
      }
    }

    yield originalType.generateTypeInfo(originalParam, this.options);

    // EncryptionAlgo: BYTE
    // 2 = AEAD_AES_256_CBC_HMAC_SHA_256 (the standard algorithm)
    cipherInfoBuffer.writeUInt8(cryptoMetadata.cipherAlgorithmId);

    // AlgoName: B_VARCHAR - only sent if EncryptionAlgo = 0 (custom algorithm)
    if (cryptoMetadata.cipherAlgorithmId === 0 && cryptoMetadata.cipherAlgorithmName) {
      cipherInfoBuffer.writeBVarchar(cryptoMetadata.cipherAlgorithmName);
    }

    // EncryptionType: BYTE (1 = deterministic, 2 = randomized)
    cipherInfoBuffer.writeUInt8(cryptoMetadata.encryptionType);

    // DatabaseId: ULONG (4 bytes)
    cipherInfoBuffer.writeUInt32LE(cekEntry.databaseId);

    // CekId: ULONG (4 bytes)
    cipherInfoBuffer.writeUInt32LE(cekEntry.cekId);

    // CekVersion: ULONG (4 bytes)
    cipherInfoBuffer.writeUInt32LE(cekEntry.cekVersion);

    // CekMDVersion: ULONGLONG (8 bytes)
    // cekMdVersion is stored as a Buffer, should be 8 bytes
    if (cekEntry.cekMdVersion.length >= 8) {
      cipherInfoBuffer.writeBuffer(cekEntry.cekMdVersion.slice(0, 8));
    } else {
      // Pad with zeros if shorter
      const padded = Buffer.alloc(8);
      cekEntry.cekMdVersion.copy(padded);
      cipherInfoBuffer.writeBuffer(padded);
    }

    // NormVersion: BYTE (must be 1)
    cipherInfoBuffer.writeUInt8(cryptoMetadata.normalizationRuleVersion[0] || 1);

    yield cipherInfoBuffer.data;
  }
}

export default RpcRequestPayload;
module.exports = RpcRequestPayload;
