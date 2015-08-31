import metadataParse from '../metadata-parser';

export default function*(parser, colMetadata, options) {
  const columnCount = yield parser.readUInt16LE();

  const columns = [];

  for (let i = 0; i < columnCount; i++) {
    const metadata = yield* metadataParse(parser, options);

    let tableName;
    if (metadata.type.hasTableName) {
      if (options.tdsVersion >= '7_2') {
        tableName = [];

        const numberOfTableNameParts = yield parser.readUInt8();
        for (let j = 0; j < numberOfTableNameParts; j++) {
          tableName.push(yield* parser.readUsVarChar());
        }
      } else {
        tableName = yield* parser.readUsVarChar();
      }
    } else {
      tableName = undefined;
    }

    let colName = yield* parser.readBVarChar();
    if (options.columnNameReplacer) {
      colName = options.columnNameReplacer(colName, i, metadata);
    } else if (options.camelCaseColumns) {
      colName = colName.replace(/^[A-Z]/, function(s) {
        return s.toLowerCase();
      });
    }

    columns.push({
      userType: metadata.userType,
      flags: metadata.flags,
      type: metadata.type,
      colName: colName,
      collation: metadata.collation,
      precision: metadata.precision,
      scale: metadata.scale,
      udtInfo: metadata.udtInfo,
      dataLength: metadata.dataLength,
      tableName: tableName
    });
  }

  return {
    name: 'COLMETADATA',
    event: 'columnMetadata',
    columns: columns
  };
}
