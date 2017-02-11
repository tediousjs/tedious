'use strict';

// s2.2.7.16

var metadataParse = require('../metadata-parser');
var valueParse = require('../value-parser');

module.exports = function (parser, colMetadata, options, callback) {
  parser.readUInt16LE(function (paramOrdinal) {
    parser.readBVarChar(function (paramName) {
      if (paramName.charAt(0) === '@') {
        paramName = paramName.slice(1);
      }

      // status
      parser.readUInt8(function () {
        metadataParse(parser, options, function (metadata) {
          valueParse(parser, metadata, options, function (value) {
            callback({
              name: 'RETURNVALUE',
              event: 'returnValue',
              paramOrdinal: paramOrdinal,
              paramName: paramName,
              metadata: metadata,
              value: value
            });
          });
        });
      });
    });
  });
};