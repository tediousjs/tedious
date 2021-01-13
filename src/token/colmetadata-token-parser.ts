import metadataParse, { Metadata } from '../metadata-parser';

import Parser from './stream-parser';
import { InternalConnectionOptions } from '../connection';
import { ColMetadataToken } from './token';

import { typeByName } from '../data-type';

export interface ColumnMetadata extends Metadata {
  /**
   * The column's name。
   */
  colName: string;

  tableName?: string | string[];
  typeName?: string;
}

const dataTypeSpecific: { [key: string]: (dataLength: number) => string | undefined } = {
  /* BitN */
  [0x68]: (dataLength: number) => {
    return (dataLength === 1) ? typeByName.Bit.name : undefined;
  },

  /* datetimeN */
  [0x6F]: (dataLength: number) => {
    switch (dataLength) {
      case 4:
        return typeByName.SmallDateTime.name;

      case 8:
        return typeByName.DateTime.name;

      default: return undefined;
    }
  },

  /* decimalN */
  [0x6A]: (dataLength: number) => {
    return (dataLength === 17) ? typeByName.Decimal.name : undefined;
  },

  /* floatN */
  [0x6D]: (dataLength: number) => {
    return (dataLength === 4 || dataLength === 8) ? typeByName.Float.name : undefined;
  },

  /* intN */
  [0x26]: (dataLength: number) => {
    switch (dataLength) {
      case 1:
        return typeByName.TinyInt.name;

      case 2:
        return typeByName.SmallInt.name;

      case 4:
        return typeByName.Int.name;

      case 8:
        return typeByName.BigInt.name;

      default: return undefined;
    }
  },

  /* moneyN */
  [0x6E]: (dataLength: number) => {
    switch (dataLength) {
      case 4:
        return typeByName.SmallMoney.name;

      case 8:
        return typeByName.Money.name;

      default: return undefined;
    }
  },

  /* numericN */
  [0x6C]: (dataLength: number) => {
    return (dataLength === 17) ? typeByName.Numeric.name : undefined;
  },

};

function readTableName(parser: Parser, options: InternalConnectionOptions, metadata: Metadata, callback: (tableName?: string | string[]) => void) {
  if (metadata.type.hasTableName) {
    if (options.tdsVersion >= '7_2') {
      parser.readUInt8((numberOfTableNameParts) => {
        const tableName: string[] = [];

        let i = 0;
        function next(done: () => void) {
          if (numberOfTableNameParts === i) {
            return done();
          }

          parser.readUsVarChar((part) => {
            tableName.push(part);

            i++;

            next(done);
          });
        }

        next(() => {
          callback(tableName);
        });
      });
    } else {
      parser.readUsVarChar(callback);
    }
  } else {
    callback(undefined);
  }
}

function readColumnName(parser: Parser, options: InternalConnectionOptions, index: number, metadata: Metadata, callback: (colName: string) => void) {
  parser.readBVarChar((colName) => {
    if (options.columnNameReplacer) {
      callback(options.columnNameReplacer(colName, index, metadata));
    } else if (options.camelCaseColumns) {
      callback(colName.replace(/^[A-Z]/, function(s) {
        return s.toLowerCase();
      }));
    } else {
      callback(colName);
    }
  });
}

function readColumn(parser: Parser, options: InternalConnectionOptions, index: number, callback: (column: ColumnMetadata) => void) {
  metadataParse(parser, options, (metadata) => {
    readTableName(parser, options, metadata, (tableName) => {
      readColumnName(parser, options, index, metadata, (colName) => {
        callback({
          userType: metadata.userType,
          flags: metadata.flags,
          type: metadata.type,
          collation: metadata.collation,
          precision: metadata.precision,
          scale: metadata.scale,
          udtInfo: metadata.udtInfo,
          dataLength: metadata.dataLength,
          schema: metadata.schema,
          colName: colName,
          tableName: tableName
        });
      });
    });
  });
}

export function specifyDataType(columns: ColumnMetadata[]): ColumnMetadata[] {
  return columns.map((col: ColumnMetadata) => {
    if (
      col.type.id === 0x68 ||
      col.type.id === 0x6F ||
      col.type.id === 0x6A ||
      col.type.id === 0x6D ||
      col.type.id === 0x26 ||
      col.type.id === 0x6E ||
      col.type.id === 0x6C
    ) {
      if (col.dataLength) {
        col.typeName = dataTypeSpecific[col.type.id](col.dataLength);
      }
    }

    return col;
  });
}

export default function colMetadataParser(parser: Parser, options: InternalConnectionOptions, callback: (token: ColMetadataToken) => void) {
  parser.readUInt16LE((columnCount) => {
    const columns: ColumnMetadata[] = [];

    let i = 0;
    function next(done: () => void) {
      if (i === columnCount) {
        return done();
      }

      readColumn(parser, options, i, (column) => {
        columns.push(column);

        i++;
        next(done);
      });
    }

    next(() => {
      /*
        Adds typeName properties for N-data-types based on dataLength property.
        E.g., if type === bitN and dataLength === 1, then typeName = 'bit'. Else, undefined;
      */
      const updtColumns = specifyDataType(columns);

      callback(new ColMetadataToken(updtColumns));
    });
  });
}
