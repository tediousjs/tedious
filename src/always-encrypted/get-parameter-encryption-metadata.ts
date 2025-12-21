// This code is based on the `mssql-jdbc` library published under the conditions of MIT license.
// Copyright (c) 2019 Microsoft Corporation

import { SQLServerEncryptionType, type CryptoMetadata, DescribeParameterEncryptionResultSet1, DescribeParameterEncryptionResultSet2 } from './types';
import { CEKEntry } from './cek-entry';
import { decryptSymmetricKey } from './key-crypto';
import { typeByName as TYPES, type Parameter } from '../data-type';
import Request from '../request';
import Connection from '../connection';
import RpcRequestPayload from '../rpcrequest-payload';
import { TYPE } from '../packet';

export const getParameterEncryptionMetadata = (connection: Connection, request: Request, callback: (error?: Error) => void) => {
  if (request.cryptoMetadataLoaded === true) {
    return callback();
  }

  const metadataRequest = new Request('sp_describe_parameter_encryption', (error) => {
    if (error) {
      return callback(error);
    }

    const decryptSymmetricKeyPromises: Promise<void>[] = [];
    const cekList: CEKEntry[] = [];
    let paramCount = 0;

    for (const columns of resultRows) {
      try {
        const isFirstRecordSet = columns.some((col: any) => (col && col.metadata && col.metadata.colName) === 'database_id');
        if (isFirstRecordSet === true) {
          const currentOrdinal = columns[DescribeParameterEncryptionResultSet1.KeyOrdinal].value;
          let cekEntry: CEKEntry;
          if (!cekList[currentOrdinal]) {
            cekEntry = new CEKEntry(currentOrdinal);
            cekList[cekEntry.ordinal] = cekEntry;
          } else {
            cekEntry = cekList[currentOrdinal];
          }
          cekEntry.add(columns[DescribeParameterEncryptionResultSet1.EncryptedKey].value,
                       columns[DescribeParameterEncryptionResultSet1.DbId].value,
                       columns[DescribeParameterEncryptionResultSet1.KeyId].value,
                       columns[DescribeParameterEncryptionResultSet1.KeyVersion].value,
                       columns[DescribeParameterEncryptionResultSet1.KeyMdVersion].value,
                       columns[DescribeParameterEncryptionResultSet1.KeyPath].value,
                       columns[DescribeParameterEncryptionResultSet1.ProviderName].value,
                       columns[DescribeParameterEncryptionResultSet1.KeyEncryptionAlgorithm].value);
        } else {
          paramCount++;
          const paramName: string = columns[DescribeParameterEncryptionResultSet2.ParameterName].value;
          const paramIndex: number = request.parameters.findIndex((param: Parameter) => paramName === `@${param.name}`);
          const cekOrdinal: number = columns[DescribeParameterEncryptionResultSet2.ColumnEncryptionKeyOrdinal].value;
          const cekEntry: CEKEntry = cekList[cekOrdinal];

          if (!cekEntry) {
            return callback(new Error(`Internal error. The referenced column encryption key ordinal "${cekOrdinal}" is missing in the encryption metadata returned by sp_describe_parameter_encryption. Max ordinal is "${cekList.length - 1}".`));
          }

          const encType = columns[DescribeParameterEncryptionResultSet2.ColumnEncrytionType].value;
          if (SQLServerEncryptionType.PlainText !== encType) {
            request.parameters[paramIndex].cryptoMetadata = {
              cekEntry: cekEntry,
              ordinal: cekOrdinal,
              cipherAlgorithmId: columns[DescribeParameterEncryptionResultSet2.ColumnEncryptionAlgorithm].value,
              encryptionType: encType,
              normalizationRuleVersion: Buffer.from([columns[DescribeParameterEncryptionResultSet2.NormalizationRuleVersion].value]),
            };
            decryptSymmetricKeyPromises.push(decryptSymmetricKey(request.parameters[paramIndex].cryptoMetadata as CryptoMetadata, connection.config.options));
          } else if (request.parameters[paramIndex].forceEncrypt === true) {
            return callback(new Error(`Cannot execute statement or procedure ${request.sqlTextOrProcedure} because Force Encryption was set as true for parameter ${paramIndex + 1} and the database expects this parameter to be sent as plaintext. This may be due to a configuration error.`));
          }
        }
      } catch {
        return callback(new Error(`Internal error. Unable to parse parameter encryption metadata in statement or procedure "${request.sqlTextOrProcedure}"`));
      }
    }

    if (paramCount !== request.parameters.length) {
      return callback(new Error(`Internal error. Metadata for some parameters in statement or procedure "${request.sqlTextOrProcedure}" is missing in the resultset returned by sp_describe_parameter_encryption.`));
    }

    return Promise.all(decryptSymmetricKeyPromises).then(() => {
      request.cryptoMetadataLoaded = true;
      process.nextTick(callback);
    }, (error) => {
      process.nextTick(callback, error);
    });
  });

  metadataRequest.addParameter('tsql', TYPES.NVarChar, request.sqlTextOrProcedure);
  if (request.parameters.length) {
    metadataRequest.addParameter('params', TYPES.NVarChar, metadataRequest.makeParamsParameter(request.parameters));
  }

  const resultRows: any[] = [];

  metadataRequest.on('row', (columns: any) => {
    resultRows.push(columns);
  });

  connection.makeRequest(metadataRequest, TYPE.RPC_REQUEST, new RpcRequestPayload(metadataRequest.sqlTextOrProcedure!, metadataRequest.parameters, connection.currentTransactionDescriptor(), connection.config.options, connection.databaseCollation));
};
