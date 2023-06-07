import { Collation } from './collation';
import Parser, { ParserOptions } from './token/stream-parser';
import { TYPE, DataType } from './data-type';
import { CryptoMetadata } from './always-encrypted/types';

import { sprintf } from 'sprintf-js';

interface XmlSchema {
  dbname: string;
  owningSchema: string;
  xmlSchemaCollection: string;
}

interface UdtInfo {
  maxByteSize: number;
  dbname: string;
  owningSchema: string;
  typeName: string;
  assemblyName: string;
}

export type BaseMetadata = {
  userType: number;

  flags: number;
  /**
   * The column's type, such as VarChar, Int or Binary.
   */
  type: DataType;

  collation: Collation | undefined;
  /**
   * The precision. Only applicable to numeric and decimal.
   */
  precision: number | undefined;

  /**
   * The scale. Only applicable to numeric, decimal, time, datetime2 and datetimeoffset.
   */
  scale: number | undefined;

  /**
   * The length, for char, varchar, nvarchar and varbinary.
   */
  dataLength: number | undefined;

  schema: XmlSchema | undefined;

  udtInfo: UdtInfo | undefined;
}

export type Metadata = {
  cryptoMetadata?: CryptoMetadata;
} & BaseMetadata;


function readCollation(parser: Parser, callback: (collation: Collation) => void) {
  // s2.2.5.1.2
  parser.readBuffer(5, (collationData) => {
    callback(Collation.fromBuffer(collationData));
  });
}

function readSchema(parser: Parser, callback: (schema: XmlSchema | undefined) => void) {
  // s2.2.5.5.3
  parser.readUInt8((schemaPresent) => {
    if (schemaPresent === 0x01) {
      parser.readBVarChar((dbname) => {
        parser.readBVarChar((owningSchema) => {
          parser.readUsVarChar((xmlSchemaCollection) => {
            callback({
              dbname: dbname,
              owningSchema: owningSchema,
              xmlSchemaCollection: xmlSchemaCollection
            });
          });
        });
      });
    } else {
      callback(undefined);
    }
  });
}

function readUDTInfo(parser: Parser, callback: (udtInfo: UdtInfo | undefined) => void) {
  parser.readUInt16LE((maxByteSize) => {
    parser.readBVarChar((dbname) => {
      parser.readBVarChar((owningSchema) => {
        parser.readBVarChar((typeName) => {
          parser.readUsVarChar((assemblyName) => {
            callback({
              maxByteSize: maxByteSize,
              dbname: dbname,
              owningSchema: owningSchema,
              typeName: typeName,
              assemblyName: assemblyName
            });
          });
        });
      });
    });
  });
}

function metadataParse(parser: Parser, options: ParserOptions, callback: (metadata: Metadata) => void) {
  (options.tdsVersion < '7_2' ? parser.readUInt16LE : parser.readUInt32LE).call(parser, (userType) => {
    parser.readUInt16LE((flags) => {
      parser.readUInt8((typeNumber) => {
        const type: DataType = TYPE[typeNumber];

        if (!type) {
          throw new Error(sprintf('Unrecognised data type 0x%02X', typeNumber));
        }

        switch (type.name) {
          case 'Null':
          case 'TinyInt':
          case 'SmallInt':
          case 'Int':
          case 'BigInt':
          case 'Real':
          case 'Float':
          case 'SmallMoney':
          case 'Money':
          case 'Bit':
          case 'SmallDateTime':
          case 'DateTime':
          case 'Date':
            return callback({
              userType: userType,
              flags: flags,
              type: type,
              collation: undefined,
              precision: undefined,
              scale: undefined,
              dataLength: undefined,
              schema: undefined,
              udtInfo: undefined
            });

          case 'IntN':
          case 'FloatN':
          case 'MoneyN':
          case 'BitN':
          case 'UniqueIdentifier':
          case 'DateTimeN':
            return parser.readUInt8((dataLength) => {
              callback({
                userType: userType,
                flags: flags,
                type: type,
                collation: undefined,
                precision: undefined,
                scale: undefined,
                dataLength: dataLength,
                schema: undefined,
                udtInfo: undefined
              });
            });

          case 'Variant':
            return parser.readUInt32LE((dataLength) => {
              callback({
                userType: userType,
                flags: flags,
                type: type,
                collation: undefined,
                precision: undefined,
                scale: undefined,
                dataLength: dataLength,
                schema: undefined,
                udtInfo: undefined
              });
            });

          case 'VarChar':
          case 'Char':
          case 'NVarChar':
          case 'NChar':
            return parser.readUInt16LE((dataLength) => {
              readCollation(parser, (collation) => {
                callback({
                  userType: userType,
                  flags: flags,
                  type: type,
                  collation: collation,
                  precision: undefined,
                  scale: undefined,
                  dataLength: dataLength,
                  schema: undefined,
                  udtInfo: undefined
                });
              });
            });

          case 'Text':
          case 'NText':
            return parser.readUInt32LE((dataLength) => {
              readCollation(parser, (collation) => {
                callback({
                  userType: userType,
                  flags: flags,
                  type: type,
                  collation: collation,
                  precision: undefined,
                  scale: undefined,
                  dataLength: dataLength,
                  schema: undefined,
                  udtInfo: undefined
                });
              });
            });

          case 'VarBinary':
          case 'Binary':
            return parser.readUInt16LE((dataLength) => {
              callback({
                userType: userType,
                flags: flags,
                type: type,
                collation: undefined,
                precision: undefined,
                scale: undefined,
                dataLength: dataLength,
                schema: undefined,
                udtInfo: undefined
              });
            });

          case 'Image':
            return parser.readUInt32LE((dataLength) => {
              callback({
                userType: userType,
                flags: flags,
                type: type,
                collation: undefined,
                precision: undefined,
                scale: undefined,
                dataLength: dataLength,
                schema: undefined,
                udtInfo: undefined
              });
            });

          case 'Xml':
            return readSchema(parser, (schema) => {
              callback({
                userType: userType,
                flags: flags,
                type: type,
                collation: undefined,
                precision: undefined,
                scale: undefined,
                dataLength: undefined,
                schema: schema,
                udtInfo: undefined
              });
            });

          case 'Time':
          case 'DateTime2':
          case 'DateTimeOffset':
            return parser.readUInt8((scale) => {
              callback({
                userType: userType,
                flags: flags,
                type: type,
                collation: undefined,
                precision: undefined,
                scale: scale,
                dataLength: undefined,
                schema: undefined,
                udtInfo: undefined
              });
            });

          case 'NumericN':
          case 'DecimalN':
            return parser.readUInt8((dataLength) => {
              parser.readUInt8((precision) => {
                parser.readUInt8((scale) => {
                  callback({
                    userType: userType,
                    flags: flags,
                    type: type,
                    collation: undefined,
                    precision: precision,
                    scale: scale,
                    dataLength: dataLength,
                    schema: undefined,
                    udtInfo: undefined
                  });
                });
              });
            });

          case 'UDT':
            return readUDTInfo(parser, (udtInfo) => {
              callback({
                userType: userType,
                flags: flags,
                type: type,
                collation: undefined,
                precision: undefined,
                scale: undefined,
                dataLength: undefined,
                schema: undefined,
                udtInfo: udtInfo
              });
            });

          default:
            throw new Error(sprintf('Unrecognised type %s', type.name));
        }
      });
    });
  });
}

export default metadataParse;
export { readCollation };

module.exports = metadataParse;
module.exports.readCollation = readCollation;
