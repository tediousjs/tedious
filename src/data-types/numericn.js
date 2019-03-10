function readUNumeric64LE(buffer, offset) {
  const low = buffer.readUInt32LE(offset);
  const high = buffer.readUInt32LE(offset + 4);

  return (0x100000000 * high) + low;
}

function readUNumeric96LE(buffer, offset) {
  const dword1 = buffer.readUInt32LE(offset);
  const dword2 = buffer.readUInt32LE(offset + 4);
  const dword3 = buffer.readUInt32LE(offset + 8);

  return dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3);
}

function readUNumeric128LE(buffer, offset) {
  const dword1 = buffer.readUInt32LE(offset);
  const dword2 = buffer.readUInt32LE(offset + 4);
  const dword3 = buffer.readUInt32LE(offset + 8);
  const dword4 = buffer.readUInt32LE(offset + 12);

  return dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3) + (0x100000000 * 0x100000000 * 0x100000000 * dword4);
}

module.exports = {
  id: 0x6C,
  type: 'NUMERICN',
  name: 'NumericN',
  dataLengthLength: 1,
  hasPrecision: true,
  hasScale: true,

  fromBuffer(buffer, offset, dataLength, scale) {
    const sign = buffer.readUInt8(offset) === 1 ? 1 : -1;
    offset += 1;

    let value;

    switch (dataLength) {
      case 5:
        value = buffer.readUInt32LE(offset);
        break;

      case 9:
        value = readUNumeric64LE(buffer, offset);
        break;

      case 13:
        value = readUNumeric96LE(buffer, offset);
        break;

      case 17:
        value = readUNumeric128LE(buffer, offset);
        break;
    }

    return (value * sign) / Math.pow(10, scale);
  }
};
