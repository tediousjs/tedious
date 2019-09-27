import { codepageBySortId, codepageByLcid } from './collation';
import Parser from './token/stream-parser';
import { ConnectionOptions } from './connection';
import { TYPE, DataType } from './data-type';

const sprintf = require('sprintf-js').sprintf;

type Collation = {
  lcid: number,
  flags: number,
  version: number,
  sortId: number,
  codepage: string
};

type XmlSchema = {
  dbname: string,
  owningSchema: string,
  xmlSchemaCollection: string
};

type UdtInfo = {
  maxByteSize: number,
  dbname: string,
  owningSchema: string,
  typeName: string,
  assemblyName: string
};

export type Metadata = {
  userType: number,
  flags: number,
  type: DataType,
  collation?: Collation,
  precision?: number,
  scale?: number,
  dataLength: number,
  schema?: XmlSchema,
  udtInfo?: UdtInfo
};

function readDataLength(parser: Parser, type: DataType, callback: (dataLength: number | undefined) => void) {
  if ((type.id & 0x30) === 0x20) {
    // xx10xxxx - s2.2.4.2.1.3
    // Variable length
    if (type.dataLengthFromScale) {
      return callback(0); // dataLength is resolved from scale
    } else if (type.fixedDataLength) {
      return callback(type.fixedDataLength);
    }

    switch (type.dataLengthLength) {
      case 0:
        return callback(undefined);

      case 1:
        return parser.readUInt8(callback);

      case 2:
        return parser.readUInt16LE(callback);

      case 4:
        return parser.readUInt32LE(callback);

      default:
        return parser.emit(new Error('Unsupported dataLengthLength ' + type.dataLengthLength + ' for data type ' + type.name));
    }
  } else {
    callback(undefined);
  }
}

function readPrecision(parser: Parser, type: DataType, callback: (precision: number | undefined) => void) {
  if (type.hasPrecision) {
    parser.readUInt8(callback);
  } else {
    callback(undefined);
  }
}

function readScale(parser: Parser, type: DataType, callback: (scale: number | undefined) => void) {
  if (type.hasScale) {
    parser.readUInt8(callback);
  } else {
    callback(undefined);
  }
}

function readCollation(parser: Parser, type: DataType, callback: (collation: Collation | undefined) => void) {
  if (type.hasCollation) {
    // s2.2.5.1.2
    parser.readBuffer(5, (collationData) => {
      let lcid = (collationData[2] & 0x0F) << 16;
      lcid |= collationData[1] << 8;
      lcid |= collationData[0];

      // This may not be extracting the correct nibbles in the correct order.
      let flags = collationData[3] >> 4;
      flags |= collationData[2] & 0xF0;

      // This may not be extracting the correct nibble.
      const version = collationData[3] & 0x0F;

      const sortId = collationData[4];

      const codepage = codepageBySortId[sortId] || codepageByLcid[lcid] || 'CP1252';

      callback({ lcid, flags, version, sortId, codepage });
    });
  } else {
    callback(undefined);
  }
}

function readSchema(parser: Parser, type: DataType, callback: (schema: XmlSchema | undefined) => void) {
  if (type.hasSchemaPresent) {
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
  } else {
    callback(undefined);
  }
}

function readUDTInfo(parser: Parser, type: DataType, callback: (udtInfo: UdtInfo | undefined) => void) {
  if (type.hasUDTInfo) {
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
  } else {
    return callback(undefined);
  }
}

function metadataParse(parser: Parser, options: ConnectionOptions, callback: (metadata: Metadata) => void) {
  (options.tdsVersion < '7_2' ? parser.readUInt16LE : parser.readUInt32LE).call(parser, (userType) => {
    parser.readUInt16LE((flags) => {
      parser.readUInt8((typeNumber) => {
        const type: DataType = TYPE[typeNumber];

        if (!type) {
          return parser.emit(new Error(sprintf('Unrecognised data type 0x%02X', typeNumber)));
        }

        readDataLength(parser, type, (dataLength) => {
          readPrecision(parser, type, (precision) => {
            readScale(parser, type, (scale) => {
              if (scale && type.dataLengthFromScale) {
                dataLength = type.dataLengthFromScale(scale);
              }

              readCollation(parser, type, (collation) => {
                readSchema(parser, type, (schema) => {
                  readUDTInfo(parser, type, (udtInfo) => {
                    callback({
                      userType: userType,
                      flags: flags,
                      type: type,
                      collation: collation,
                      precision: precision,
                      scale: scale,
                      dataLength: dataLength!,
                      schema: schema,
                      udtInfo: udtInfo
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

export default metadataParse;
export { readPrecision, readScale, readCollation };

module.exports = metadataParse;
module.exports.readPrecision = readPrecision;
module.exports.readScale = readScale;
module.exports.readCollation = readCollation;
