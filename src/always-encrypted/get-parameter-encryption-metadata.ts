import { DescribeParameterEncryptionResultSet1, DescribeParameterEncryptionResultSet2 } from './types';
import { SQLServerEncryptionType, CryptoMetadata } from './types';
import { CEKTableEntry } from './cek-table';
import { decryptSymmetricKey } from './key-crypto';
import { typeByName as TYPES, Parameter } from '../data-type';
import Request from "../request";
import Connection from "../connection";
import RpcRequestPayload from '../rpcrequest-payload';
import { TYPE } from '../packet';

export const getParameterEncryptionMetadata = (connection: Connection, request: Request, callback: (error?: Error) => void) => {
  if (request.cryptoMetadataLoaded === true) {
    return callback();
  }

  const decryptSymmetricKeyPromises: Promise<void>[] = [];
  let paramCount = 0;
  const metadataRequest = new Request('sp_describe_parameter_encryption', (error) => {
    if (error) {
      return callback(error);
    }
    if (paramCount !== request.parameters.length) {
      return callback(new Error(`Internal error. Metadata for some parameters in statement or procedure "${request.sqlTextOrProcedure}" is missing in the resultset returned by sp_describe_parameter_encryption.`));
    }
    return Promise.all(decryptSymmetricKeyPromises).then(() => {
      request.cryptoMetadataLoaded = true;
      callback();
    }).catch(callback);
  });

  metadataRequest.originalParameters = request.parameters;
  metadataRequest.addParameter('tsql', TYPES.NVarChar, request.sqlTextOrProcedure);
  if (metadataRequest.originalParameters && metadataRequest.originalParameters.length) {
    metadataRequest.addParameter('params', TYPES.NVarChar, metadataRequest.makeParamsParameter(metadataRequest.originalParameters));
  }

  const cekList: CEKTableEntry[] = [];
  metadataRequest.on('row', (columns: any) => {
    try {
      const isFirstRecordSet = columns.some((col: any) => (col && col.metadata && col.metadata.colName) === 'database_id');
      if (isFirstRecordSet === true) {
        const currentOrdinal = columns[DescribeParameterEncryptionResultSet1.KeyOrdinal].value;
        let cekEntry: CEKTableEntry;
        if (!cekList[currentOrdinal]) {
          cekEntry = new CEKTableEntry(currentOrdinal);
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
        const cekEntry: CEKTableEntry = cekList[cekOrdinal];

        if (cekEntry && cekList.length < cekOrdinal) {
          return callback(new Error(`Internal error. The referenced column encryption key ordinal "${cekOrdinal}" is missing in the encryption metadata returned by sp_describe_parameter_encryption. Max ordinal is "${cekList.length}".`));
        }

        const encType = columns[DescribeParameterEncryptionResultSet2.ColumnEncrytionType].value;
        if (SQLServerEncryptionType.PlainText !== encType) {
          request.parameters[paramIndex].cryptoMetadata = {
            cekTableEntry: cekEntry,
            ordinal: cekOrdinal,
            cipherAlgorithmId: columns[DescribeParameterEncryptionResultSet2.ColumnEncryptionAlgorithm].value,
            encryptionType: encType,
            normalizationRuleVersion: Buffer.from([columns[DescribeParameterEncryptionResultSet2.NormalizationRuleVersion].value]),
          };
          decryptSymmetricKeyPromises.push(decryptSymmetricKey(<CryptoMetadata>request.parameters[paramIndex].cryptoMetadata, connection.config.options));
        } else if (request.parameters[paramIndex].forceEncrypt === true) {
          return callback(new Error(`Cannot execute statement or procedure ${request.sqlTextOrProcedure} because Force Encryption was set as true for parameter ${paramIndex + 1} and the database expects this parameter to be sent as plaintext. This may be due to a configuration error.`));
        }
      }
    } catch (error) {
      return callback(new Error(`Internal error. Unable to parse parameter encryption metadata in statement or procedure "${request.sqlTextOrProcedure}"`))
    }
  });

  connection.makeRequest(metadataRequest, TYPE.RPC_REQUEST, new RpcRequestPayload(metadataRequest, connection.currentTransactionDescriptor(), connection.config.options));
};
