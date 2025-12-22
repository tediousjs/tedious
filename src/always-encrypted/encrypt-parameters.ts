// This code is based on the `mssql-jdbc` library published under the conditions of MIT license.
// Copyright (c) 2019 Microsoft Corporation

import iconv from 'iconv-lite';
import { type Parameter, type ParameterData } from '../data-type';
import { type InternalConnectionOptions as ConnectionOptions } from '../connection';
import { encryptWithKey } from './key-crypto';
import { SQLServerEncryptionType } from './types';

// Maximum lengths for non-MAX types
const NVARCHAR_MAX_LENGTH = 4000;
const VARCHAR_MAX_LENGTH = 8000;
const VARBINARY_MAX_LENGTH = 8000;

/**
 * Serializes a parameter value to raw bytes for encryption.
 *
 * IMPORTANT: For Always Encrypted, we must serialize just the raw value bytes,
 * NOT the TDS wire format. This is different from generateParameterData which
 * includes PLP format elements (chunk lengths, terminators) for MAX types.
 *
 * @param parameter - The parameter containing value and type info
 * @param options - Connection options
 * @returns Buffer containing the serialized value, or null if value is null
 */
function serializeParameterValue(parameter: Parameter, options: ConnectionOptions): Buffer | null {
  if (parameter.value == null) {
    return null;
  }

  const type = parameter.type;
  const value = parameter.value;

  // Handle MAX types specially - serialize raw bytes only, no PLP format
  if (type.name === 'NVarChar') {
    const length = parameter.length ?? (type.resolveLength ? type.resolveLength(parameter) : 0);
    if (length > NVARCHAR_MAX_LENGTH) {
      // MAX type - just return raw UTF-16LE bytes
      if (Buffer.isBuffer(value)) {
        return value;
      }
      return Buffer.from(value.toString(), 'ucs2');
    }
  } else if (type.name === 'VarChar') {
    const length = parameter.length ?? (type.resolveLength ? type.resolveLength(parameter) : 0);
    if (length > VARCHAR_MAX_LENGTH) {
      // MAX type - just return raw encoded bytes
      if (Buffer.isBuffer(value)) {
        return value;
      }
      // Get codepage from cryptoMetadata.baseTypeInfo (set during encryption metadata lookup)
      const codepage = parameter.cryptoMetadata?.baseTypeInfo?.collation?.codepage ?? 'utf8';
      return iconv.encode(value.toString(), codepage);
    }
  } else if (type.name === 'VarBinary') {
    const length = parameter.length ?? (type.resolveLength ? type.resolveLength(parameter) : 0);
    if (length > VARBINARY_MAX_LENGTH) {
      // MAX type - just return raw bytes
      if (Buffer.isBuffer(value)) {
        return value;
      }
      // For non-Buffer values, convert to string first then to Buffer
      return Buffer.from(String(value));
    }
  }

  // For non-MAX types, use the standard serialization
  const param: ParameterData = { value: parameter.value };

  // Resolve length, precision, scale as needed
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

  // Collect all buffers from the generator
  const chunks: Buffer[] = [];
  for (const chunk of type.generateParameterData(param, options)) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return null;
  }

  return Buffer.concat(chunks);
}

/**
 * Encrypts parameters that have cryptoMetadata set.
 * This function modifies parameters in place by setting encryptedVal.
 *
 * @param parameters - Array of parameters to encrypt
 * @param options - Connection options
 */
export function encryptParameters(
  parameters: Parameter[],
  options: ConnectionOptions
): void {
  for (const parameter of parameters) {
    if (parameter.cryptoMetadata) {
      encryptParameter(parameter, options);
    }
  }
}

/**
 * Encrypts a single parameter value using its cryptoMetadata.
 *
 * @param parameter - The parameter to encrypt
 * @param options - Connection options
 */
function encryptParameter(
  parameter: Parameter,
  options: ConnectionOptions
): void {
  const cryptoMetadata = parameter.cryptoMetadata!;

  if (cryptoMetadata.encryptionType === SQLServerEncryptionType.PlainText && parameter.forceEncrypt === true) {
    throw new Error(`Force Encryption was set as true for parameter ${parameter.name} and the database expects this parameter to be sent as plaintext. This may be due to a configuration error.`);
  }

  // Serialize the value to bytes
  const plaintext = serializeParameterValue(parameter, options);

  if (plaintext === null) {
    // Null values don't need encryption
    return;
  }

  // Encrypt the serialized value
  if (!cryptoMetadata.cipherAlgorithm) {
    throw new Error('Cipher algorithm must be initialized before encryption');
  }
  const ciphertext = encryptWithKey(plaintext, cryptoMetadata.cipherAlgorithm);

  // Store the encrypted value
  parameter.encryptedVal = ciphertext;
}
