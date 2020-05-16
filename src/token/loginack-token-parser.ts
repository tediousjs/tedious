import Parser from './stream-parser';
import { InternalConnectionOptions } from '../connection';

import { LoginAckToken } from './token';

import { versionsByValue as versions } from '../tds-versions';

const interfaceTypes: { [key: number]: string } = {
  0: 'SQL_DFLT',
  1: 'SQL_TSQL'
};

function loginAckParser(parser: Parser, _options: InternalConnectionOptions, callback: (token: LoginAckToken) => void) {
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
                  callback(new LoginAckToken({
                    interface: interfaceType,
                    tdsVersion: tdsVersion,
                    progName: progName,
                    progVersion: {
                      major: major,
                      minor: minor,
                      buildNumHi: buildNumHi,
                      buildNumLow: buildNumLow
                    }
                  }));
                });
              });
            });
          });
        });
      });
    });
  });
}

export default loginAckParser;
module.exports = loginAckParser;
