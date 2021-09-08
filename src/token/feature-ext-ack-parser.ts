import Parser from './stream-parser';
import { InternalConnectionOptions } from '../connection';

import { FeatureExtAckToken } from './token';

const FEATURE_ID = {
  SESSIONRECOVERY: 0x01,
  FEDAUTH: 0x02,
  COLUMNENCRYPTION: 0x04,
  GLOBALTRANSACTIONS: 0x05,
  AZURESQLSUPPORT: 0x08,
  UTF8_SUPPORT: 0x0A,
  TERMINATOR: 0xFF
};

function featureExtAckParser(parser: Parser, _options: InternalConnectionOptions, callback: (token: FeatureExtAckToken) => void) {
  let fedAuth: Buffer | undefined;
  let utf8Support: boolean | undefined;

  function next() {
    parser.readUInt8((featureId) => {
      if (featureId === FEATURE_ID.TERMINATOR) {
        return callback(new FeatureExtAckToken(fedAuth, utf8Support));
      }

      parser.readUInt32LE((featureAckDataLen) => {
        parser.readBuffer(featureAckDataLen, (featureData) => {
          switch (featureId) {
            case FEATURE_ID.FEDAUTH:
              fedAuth = featureData;
              break;
            case FEATURE_ID.UTF8_SUPPORT:
              utf8Support = !!featureData[0];
              break;
          }
          next();
        });
      });
    });
  }

  next();
}

export default featureExtAckParser;
module.exports = featureExtAckParser;
