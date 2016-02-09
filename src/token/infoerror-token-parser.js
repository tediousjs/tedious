'use strict';

function parseToken(parser, options, callback) {
  // length
  parser.readUInt16LE(() => {
    parser.readUInt32LE((number) => {
      parser.readUInt8((state) => {
        parser.readUInt8((clazz) => {
          parser.readUsVarChar((message) => {
            parser.readBVarChar((serverName) => {
              parser.readBVarChar((procName) => {
                (options.tdsVersion < '7_2' ? parser.readUInt16LE : parser.readUInt32LE).call(parser, (lineNumber) => {
                  callback({
                    'number': number,
                    'state': state,
                    'class': clazz,
                    'message': message,
                    'serverName': serverName,
                    'procName': procName,
                    'lineNumber': lineNumber
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

module.exports.infoParser = infoParser;
function infoParser(parser, colMetadata, options, callback) {
  parseToken(parser, options, (token) => {
    token.name = 'INFO';
    token.event = 'infoMessage';
    callback(token);
  });
}

module.exports.errorParser = errorParser;
function errorParser(parser, colMetadata, options, callback) {
  parseToken(parser, options, (token) => {
    token.name = 'ERROR';
    token.event = 'errorMessage';
    callback(token);
  });
}
