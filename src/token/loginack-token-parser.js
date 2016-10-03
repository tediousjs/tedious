'use strict';

const versions = require('../tds-versions').versionsByValue;

const interfaceTypes = {
  0: 'SQL_DFLT',
  1: 'SQL_TSQL'
};

module.exports = function(parser, colMetadata, options, callback) {
  if (!this.bytesAvailable(2)) {
    return;
  }

  const length = this.readUInt16LE();
  if (!this.bytesAvailable(2 + length)) {
    return;
  }

  this.consumeBytes(2);

  const interfaceNumber = this.readUInt8();
  const interfaceType = interfaceTypes[interfaceNumber];

  this.consumeBytes(1);

  const tdsVersionNumber = this.readUInt32BE();
  const tdsVersion = versions[tdsVersionNumber];

  this.consumeBytes(4);

  const progNameLength = this.readUInt8() * 2;
  const progName = this.readString('ucs2', 0, progNameLength);
  this.consumeBytes(1 + progNameLength);

  const major = this.readUInt8();
  const minor = this.readUInt8(1);
  const buildNumHi = this.readUInt8(2);
  const buildNumLow = this.readUInt8(3);

  this.consumeBytes(4);

  this.push({
    'name': 'LOGINACK',
    'event': 'loginack',
    'interface': interfaceType,
    'tdsVersion': tdsVersion,
    'progName': progName,
    'progVersion': {
      major: major,
      minor: minor,
      buildNumHi: buildNumHi,
      buildNumLow: buildNumLow
    }
  });

  return this.parseNextToken;
};
