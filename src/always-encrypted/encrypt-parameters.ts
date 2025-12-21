// This code is based on the `mssql-jdbc` library published under the conditions of MIT license.
// Copyright (c) 2019 Microsoft Corporation

import { type Parameter, type ParameterData } from '../data-type';
import { type InternalConnectionOptions as ConnectionOptions } from '../connection';
import { encryptWithKey } from './key-crypto';

/**
 * Serializes a parameter value to bytes according to its data type.
 * This is similar to generateParameterData but returns a single Buffer.
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
export async function encryptParameters(
  parameters: Parameter[],
  options: ConnectionOptions
): Promise<void> {
  const encryptionPromises: Promise<void>[] = [];

  for (const parameter of parameters) {
    if (parameter.cryptoMetadata) {
      const promise = encryptParameter(parameter, options);
      encryptionPromises.push(promise);
    }
  }

  await Promise.all(encryptionPromises);
}

/**
 * Encrypts a single parameter value using its cryptoMetadata.
 *
 * @param parameter - The parameter to encrypt
 * @param options - Connection options
 */
async function encryptParameter(
  parameter: Parameter,
  options: ConnectionOptions
): Promise<void> {
  const cryptoMetadata = parameter.cryptoMetadata!;

  // Serialize the value to bytes
  const plaintext = serializeParameterValue(parameter, options);

  if (plaintext === null) {
    // Null values don't need encryption
    return;
  }

  // Encrypt the serialized value
  const ciphertext = await encryptWithKey(plaintext, cryptoMetadata, options);

  // Store the encrypted value
  parameter.encryptedVal = ciphertext;
}
