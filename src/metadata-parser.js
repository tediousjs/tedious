'use strict';

const codepageBySortId = require('./collation').codepageBySortId;
const codepageByLcid = require('./collation').codepageByLcid;
const TYPE = require('./data-type').TYPE;
const sprintf = require('sprintf').sprintf;

module.exports = metadataParse;
module.exports.readPrecision = readPrecision;
module.exports.readScale = readScale;
module.exports.readCollation = readCollation;

function metadataParse(parser, next) {
  this.pushState({ next: next });

  const metadata = {
    userType: undefined,
    flags: undefined,
    type: undefined,
    collation: undefined,
    precision: undefined,
    scale: undefined,
    dataLength: undefined,
    schema: undefined,
    udtInfo: undefined
  };
  this.pushState(metadata);

  return readUserType;
}

function readUserType() {
  const state = this.currentState();

  if (this.options.tdsVersion < '7_2') {
    if (!this.bytesAvailable(5)) {
      return;
    }

    state.userType = this.readUInt16LE();
    state.flags = this.readUInt16LE(2);

    const typeNumber = this.readUInt8(4);
    state.type = TYPE[typeNumber];
    if (!state.type) {
      throw new Error(sprintf('Unrecognised data type 0x%02X', typeNumber));
    }

    this.consumeBytes(5);
  } else {
    if (!this.bytesAvailable(7)) {
      return;
    }

    state.userType = this.readUInt32LE();
    state.flags = this.readUInt16LE(4);

    const typeNumber = this.readUInt8(6);
    state.type = TYPE[typeNumber];
    if (!state.type) {
      throw new Error(sprintf('Unrecognised data type 0x%02X', typeNumber));
    }

    this.consumeBytes(7);
  }

  return readDataLength;
}

function readType() {
  if (!this.bytesAvailable(1)) {
    return;
  }

  const state = this.currentState();
  const typeNumber = this.readUInt8();
  this.position += 1;

  state.type = TYPE[typeNumber];
  if (!state.type) {
    throw new Error(sprintf('Unrecognised data type 0x%02X', typeNumber));
  }

  return readDataLength;
}

function readDataLength() {
  const state = this.currentState();
  const type = state.type;

  if ((type.id & 0x30) !== 0x20) {
    return readPrecision;
  }

  // xx10xxxx - s2.2.4.2.1.3
  // Variable length
  if (type.dataLengthFromScale) {
    state.dataLength = 0;
    return readPrecision;
  } else if (type.fixedDataLength) {
    state.dataLength = type.fixedDataLength;
    return readPrecision;
  }

  switch (type.dataLengthLength) {
    case 0:
      return readPrecision;

    case 1:
      if (!this.bytesAvailable(1)) {
        return;
      }

      state.dataLength = this.readUInt8();
      this.consumeBytes(1);
      return readPrecision;

    case 2:
      if (!this.bytesAvailable(2)) {
        return;
      }

      state.dataLength = this.readUInt16LE();
      this.consumeBytes(2);
      return readPrecision;

    case 4:
      if (!this.bytesAvailable(4)) {
        return;
      }

      state.dataLength = this.readUInt32LE();
      this.consumeBytes(4);
      return readPrecision;

    default:
      this.emit(new Error('Unsupported dataLengthLength ' + type.dataLengthLength + ' for data type ' + type.name));
  }
}

function readPrecision(parser) {
  const state = parser.currentState();

  if (state.type.hasPrecision) {
    if (!this.bytesAvailable(1)) {
      return;
    }

    state.precision = parser.buffer.readUInt8(parser.position, true);
    this.consumeBytes(1);
  }

  return readScale;
}

function readScale(parser) {
  const state = parser.currentState();

  if (state.type.hasScale) {
    if (!this.bytesAvailable(1)) {
      return;
    }

    state.scale = parser.buffer.readUInt8(parser.position, true);

    if (state.scale && state.type.dataLengthFromScale) {
      state.dataLength = state.type.dataLengthFromScale(state.scale);
    }

    this.consumeBytes(1);
  }

  return readCollation;
}

function readCollation() {
  const state = this.currentState();

  // s2.2.5.1.2
  if (state.type.hasCollation) {
    if (!this.bytesAvailable(5)) {
      return;
    }

    const collationData = this.readBuffer(0, 5);
    this.consumeBytes(5);

    const collation = {
      lcid: undefined,
      flags: undefined,
      version: undefined,
      sortId: undefined,
      codepage: undefined
    };

    collation.lcid = (collationData[2] & 0x0F) << 16;
    collation.lcid |= collationData[1] << 8;
    collation.lcid |= collationData[0];

    // This may not be extracting the correct nibbles in the correct order.
    collation.flags = collationData[3] >> 4;
    collation.flags |= collationData[2] & 0xF0;

    // This may not be extracting the correct nibble.
    collation.version = collationData[3] & 0x0F;

    collation.sortId = collationData[4];

    collation.codepage = codepageBySortId[collation.sortId] || codepageByLcid[collation.lcid] || 'CP1252';

    state.collation = collation;
  }

  return readSchema;
}

function readSchema() {
  const state = this.currentState();

  if (state.type.hasSchemaPresent) {
    // s2.2.5.5.3
    // parser.readUInt8((schemaPresent) => {
    //   if (schemaPresent === 0x01) {
    //     parser.readBVarChar((dbname) => {
    //       parser.readBVarChar((owningSchema) => {
    //         parser.readUsVarChar((xmlSchemaCollection) => {
    //           callback({
    //             dbname: dbname,
    //             owningSchema: owningSchema,
    //             xmlSchemaCollection: xmlSchemaCollection
    //           });
    //         });
    //       });
    //     });
    //   } else {
    //     callback(undefined);
    //   }
    // });
  }

  return readUDTInfo;
}

function readUDTInfo() {
  const state = this.currentState();

  if (state.type.hasUDTInfo) {
    // parser.readUInt16LE((maxByteSize) => {
    //   parser.readBVarChar((dbname) => {
    //     parser.readBVarChar((owningSchema) => {
    //       parser.readBVarChar((typeName) => {
    //         parser.readUsVarChar((assemblyName) => {
    //           callback({
    //             maxByteSize: maxByteSize,
    //             dbname: dbname,
    //             owningSchema: owningSchema,
    //             typeName: typeName,
    //             assemblyName: assemblyName
    //           });
    //         });
    //       });
    //     });
    //   });
    // });
  }

  return finishMetadataParse;
}

function finishMetadataParse() {
  const metaData = this.popState();
  const next = this.popState().next;

  this.pushState(metaData);

  return next;
}
