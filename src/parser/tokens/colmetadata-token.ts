import { FlatMap, Map, Result, Parser, Sequence, UInt16LE, UInt8, BVarchar, UsVarchar } from '..';
import { Metadata, XmlSchema } from '../../metadata-parser';

import { TYPE } from '../../data-type';
import { ColMetadataToken } from '../../token/token';

function buildColMetadataToken([metadata, tableName, colName]: [metadata: Metadata, tableName: string[] | string | undefined, colName: string]) {
  return {
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
  };
}

export class ColMetadataTokenParser extends Map<[Metadata, string[] | string | undefined, string], ColMetadataToken> {
  constructor() {
    super(new Sequence<[Metadata, string, string]>([new MetadataParser(), new UsVarchar(), new BVarchar()]), buildColMetadataToken);
  }
}

/**
 * Parser that consumes no bytes and just returns its input value.
 */
class Identity<T> extends Parser<T> {
  value: T;

  constructor(value: T) {
    super();
    this.value = value;
  }

  parse(buffer: Buffer, offset: number): Result<T> {
    return { done: true, value: this.value, offset: offset };
  }
}

function buildXmlSchema([dbname, owningSchema, xmlSchemaCollection]: [string, string, string]): XmlSchema {
  return {
    dbname: dbname,
    owningSchema: owningSchema,
    xmlSchemaCollection: xmlSchemaCollection
  };
}

class SchemaParser extends Map<[string, string, string], XmlSchema> {
  constructor() {
    super(new Sequence<[string, string, string]>([new BVarchar(), new BVarchar(), new UsVarchar()]), buildXmlSchema);
  }
}

function buildOptionalXmlSchema(schemaPresent: number) {
  if (schemaPresent === 0) {
    return new Identity(undefined);
  }

  return new SchemaParser();
}

class OptionalSchemaParser extends FlatMap<number, XmlSchema | undefined> {
  constructor() {
    super(new UInt8(), buildOptionalXmlSchema);
  }
}

export class MetadataParser extends FlatMap<[number, number, number], Metadata> {
  constructor() {
    super(
      new Sequence<[number, number, number]>([new UInt16LE(), new UInt16LE(), new UInt8()]),
      (data) => {
        const type = data[2];

        switch (type) {
          case 0x30: {
            return new Map(new Identity(data), ([userType, flags, type]) => {
              return {
                userType: userType,
                flags: flags,
                type: TYPE[type],
                collation: undefined,
                precision: undefined,
                scale: undefined,
                dataLength: undefined,
                schema: undefined,
                udtInfo: undefined
              };
            });
          }

          case 0x26: {
            return new Map<[[userType: number, flags: number, type: number], number], Metadata>(new Sequence<[[number, number, number], number]>([new Identity(data), new UInt16LE()]), ([[userType, flags, type], dataLength]) => {
              return {
                userType: userType,
                flags: flags,
                type: TYPE[type],
                collation: undefined,
                precision: undefined,
                scale: undefined,
                dataLength: dataLength,
                schema: undefined,
                udtInfo: undefined
              };
            });
          }

          default:
            throw new Error('unreachable');
        }
      }
    );
  }
}
