function isZero(array: number[]) {
  for (let j = 0, len = array.length; j < len; j++) {
    const byte = array[j];
    if (byte !== 0) {
      return false;
    }
  }
  return true;
}

function getNextRemainder(array: number[]) {
  let remainder = 0;

  for (let i = array.length - 1; i >= 0; i--) {
    const s = (remainder * 256) + array[i];
    array[i] = Math.floor(s / 10);
    remainder = s % 10;
  }

  return remainder;
}

function invert(array: number[]) {
  // Invert bits
  const len = array.length;

  for (let i = 0; i < len; i++) {
    array[i] = array[i] ^ 0xFF;
  }

  for (let i = 0; i < len; i++) {
    array[i] = array[i] + 1;

    if (array[i] > 255) {
      array[i] = 0;
    } else {
      break;
    }
  }
}

export function convertLEBytesToString(buffer: Buffer) {
  const array = Array.prototype.slice.call(buffer, 0, buffer.length);
  if (isZero(array)) {
    return '0';
  } else {
    let sign;
    if (array[array.length - 1] & 0x80) {
      sign = '-';
      invert(array);
    } else {
      sign = '';
    }
    let result = '';
    while (!isZero(array)) {
      const t = getNextRemainder(array);
      result = t + result;
    }
    return sign + result;
  }
}

export function numberToInt64LE(num: number) {
  // adapted from https://github.com/broofa/node-int64
  const negate = num < 0;
  let hi = Math.abs(num);
  let lo = hi % 0x100000000;
  hi = (hi / 0x100000000) | 0;
  const buf = Buffer.alloc(8, 0);
  for (let i = 0; i <= 7; i++) {
    buf[i] = lo & 0xff;
    lo = i === 3 ? hi : lo >>> 8;
  }
  if (negate) {
    let carry = 1;
    for (let i = 0; i <= 7; i++) {
      const v = (buf[i] ^ 0xff) + carry;
      buf[i] = v & 0xff;
      carry = v >> 8;
    }
  }
  return buf;
}
