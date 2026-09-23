import { NotEnoughDataError, readUInt32LE, readUInt8, Result } from './helpers';
import { type ParserOptions } from './stream-parser';

import { FeatureExtAckToken } from './token';

const FEATURE_ID = {
  SESSIONRECOVERY: 0x01,
  FEDAUTH: 0x02,
  COLUMNENCRYPTION: 0x04,
  GLOBALTRANSACTIONS: 0x05,
  AZURESQLSUPPORT: 0x08,
  UTF8_SUPPORT: 0x0A,
  JSON_SUPPORT: 0x0D,
  TERMINATOR: 0xFF
};

function featureExtAckParser(buf: Buffer, offset: number, _options: ParserOptions): Result<FeatureExtAckToken> {
  let fedAuth: Buffer | undefined;
  let utf8Support: boolean | undefined;
  let jsonSupport: Buffer | undefined;

  while (true) {
    let featureId;
    ({ value: featureId, offset } = readUInt8(buf, offset));

    if (featureId === FEATURE_ID.TERMINATOR) {
      return new Result(new FeatureExtAckToken(fedAuth, utf8Support, jsonSupport), offset);
    }

    let featureAckDataLen;
    ({ value: featureAckDataLen, offset } = readUInt32LE(buf, offset));

    if (buf.length < offset + featureAckDataLen) {
      throw new NotEnoughDataError(offset + featureAckDataLen);
    }

    const featureData = buf.slice(offset, offset + featureAckDataLen);
    offset += featureAckDataLen;

    switch (featureId) {
      case FEATURE_ID.FEDAUTH:
        fedAuth = featureData;
        break;
      case FEATURE_ID.UTF8_SUPPORT:
        utf8Support = !!featureData[0];
        break;
      case FEATURE_ID.JSON_SUPPORT:
        // The single data byte is the JSON version chosen by the server.
        // Whether that version is one this client supports is decided by the
        // Login7TokenHandler.
        jsonSupport = featureData;
        break;
    }
  }
}

export default featureExtAckParser;
module.exports = featureExtAckParser;
