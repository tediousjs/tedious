const cp1252 = Buffer.from('\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~€�‚ƒ„…†‡ˆ‰Š‹Œ�Ž��‘’“”•–—˜™š›œ�žŸ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ', 'ucs2');

let decoder = (buffer: Buffer, encoding: string): string => {
  if (encoding === 'WINDOWS-1252' || encoding === 'CP1252') {
    let pureAscii = true;
    for (let i = 0; i !== buffer.length; ++i) {
      if (buffer[i] >= 128) {
        pureAscii = false;
        break;
      }
    }
    if (pureAscii) {
      return buffer.toString('ascii');
    }
    const ucs2Buffer = Buffer.alloc(buffer.length * 2);
    for (let i = 0, idx1 = 0, idx2 = 0; i !== buffer.length; ++i) {
      idx1 = buffer[i] * 2; idx2 = i * 2;
      ucs2Buffer[idx2] = cp1252[idx1];
      ucs2Buffer[idx2 + 1] = cp1252[idx1 + 1];
    }
    return ucs2Buffer.toString('ucs2');
  }
  return buffer.toString(encoding as BufferEncoding);
};

export function setDecoder(d: (_buffer: Buffer, _encoding: string) => string): void {
  decoder = d;
}

export function decode(buffer: Buffer, encoding: string): string {
  return decoder(buffer, encoding);
}
