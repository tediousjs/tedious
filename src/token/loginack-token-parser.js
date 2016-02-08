'use strict';

const versions = require('../tds-versions').versionsByValue;

const interfaceTypes = {
  0: 'SQL_DFLT',
  1: 'SQL_TSQL'
};

module.exports = function(parser, colMetadata, options, callback) {
  // length
  parser.readUInt16LE(() => {
    parser.readUInt8((interfaceNumber) => {
      const interfaceType = interfaceTypes[interfaceNumber];
      parser.readUInt32BE((tdsVersionNumber) => {
        const tdsVersion = versions[tdsVersionNumber];
        parser.readBVarChar((progName) => {
          parser.readUInt8((major) => {
            parser.readUInt8((minor) => {
              parser.readUInt8((buildNumHi) => {
                parser.readUInt8((buildNumLow) => {
                  callback({
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
                });
              });
            });
          });
        });
      });
    });
  });
};
