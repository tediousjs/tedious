// s2.2.7.16

const { ReturnValueToken } = require('./token');

const metadataParse = require('../metadata-parser');
const valueParse = require('../value-parser');

module.exports = function(parser, colMetadata, options, callback) {
  parser.readUInt16LE((paramOrdinal) => {
    parser.readBVarChar((paramName) => {
      if (paramName.charAt(0) === '@') {
        paramName = paramName.slice(1);
      }

      // status
      parser.readUInt8(() => {
        metadataParse(parser, options, (metadata) => {
          valueParse(parser, metadata, options, (value) => {
            callback(new ReturnValueToken({
              paramOrdinal: paramOrdinal,
              paramName: paramName,
              metadata: metadata,
              value: value
            }));
          });
        });
      });
    });
  });
};
