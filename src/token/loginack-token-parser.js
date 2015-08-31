import { versionsByValue as versions } from '../tds-versions';

const interfaceTypes = {
  0: 'SQL_DFLT',
  1: 'SQL_TSQL'
};

module.exports = function*(parser) {
  yield parser.readUInt16LE(); // length
  const interfaceNumber = yield parser.readUInt8();
  const interfaceType = interfaceTypes[interfaceNumber];
  const tdsVersionNumber = yield parser.readUInt32BE();
  const tdsVersion = versions[tdsVersionNumber];
  const progName = yield* parser.readBVarChar();
  const progVersion = {
    major: yield parser.readUInt8(),
    minor: yield parser.readUInt8(),
    buildNumHi: yield parser.readUInt8(),
    buildNumLow: yield parser.readUInt8()
  };

  return {
    name: 'LOGINACK',
    event: 'loginack',
    "interface": interfaceType,
    tdsVersion: tdsVersion,
    progName: progName,
    progVersion: progVersion
  };
};
