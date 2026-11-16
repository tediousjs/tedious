// The offset of the `ibExtension` field in the fixed part of a LOGIN7
// payload: the 36 bytes of fixed fields, then the offset/length pairs of
// HostName, UserName, Password, AppName and ServerName.
const IB_EXTENSION_OFFSET = 56;

const FEATURE_EXT_TERMINATOR = 0xFF;

/**
 * Parses the FeatureExt block of a LOGIN7 payload into a map of feature id to
 * feature data, following `ibExtension` and `ibFeatureExtLong` the way the
 * server does. Independent of which other features are requested and in which
 * order.
 */
export function parseLogin7FeatureExt(login7: Buffer): Map<number, Buffer> {
  const ibFeatureExtLong = login7.readUInt32LE(login7.readUInt16LE(IB_EXTENSION_OFFSET));

  const features = new Map<number, Buffer>();
  let offset = ibFeatureExtLong;
  while (true) {
    const featureId = login7.readUInt8(offset);
    offset += 1;
    if (featureId === FEATURE_EXT_TERMINATOR) {
      break;
    }

    const length = login7.readUInt32LE(offset);
    offset += 4;
    features.set(featureId, login7.subarray(offset, offset + length));
    offset += length;
  }

  if (offset !== login7.length) {
    throw new Error(`The FeatureExt block must end the LOGIN7 payload, but ${login7.length - offset} byte(s) follow it`);
  }

  return features;
}
