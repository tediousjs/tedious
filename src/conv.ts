const cp1252 = Buffer.from('\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~€�‚ƒ„…†‡ˆ‰Š‹Œ�Ž��‘’“”•–—˜™š›œ�žŸ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ', 'ucs2');
const invCp1212 = new Map([[129, 129], [141, 141], [143, 143], [144, 144], [157, 157], [160, 160], [161, 161], [162, 162], [163, 163], [164, 164], [165, 165], [166, 166], [167, 167], [168, 168], [169, 169], [170, 170], [171, 171], [172, 172], [173, 173], [174, 174], [175, 175], [176, 176], [177, 177], [178, 178], [179, 179], [180, 180], [181, 181], [182, 182], [183, 183], [184, 184], [185, 185], [186, 186], [187, 187], [188, 188], [189, 189], [190, 190], [191, 191], [192, 192], [193, 193], [194, 194], [195, 195], [196, 196], [197, 197], [198, 198], [199, 199], [200, 200], [201, 201], [202, 202], [203, 203], [204, 204], [205, 205], [206, 206], [207, 207], [208, 208], [209, 209], [210, 210], [211, 211], [212, 212], [213, 213], [214, 214], [215, 215], [216, 216], [217, 217], [218, 218], [219, 219], [220, 220], [221, 221], [222, 222], [223, 223], [224, 224], [225, 225], [226, 226], [227, 227], [228, 228], [229, 229], [230, 230], [231, 231], [232, 232], [233, 233], [234, 234], [235, 235], [236, 236], [237, 237], [238, 238], [239, 239], [240, 240], [241, 241], [242, 242], [243, 243], [244, 244], [245, 245], [246, 246], [247, 247], [248, 248], [249, 249], [250, 250], [251, 251], [252, 252], [253, 253], [254, 254], [255, 255], [338, 140], [339, 156], [352, 138], [353, 154], [376, 159], [381, 142], [382, 158], [402, 131], [710, 136], [732, 152], [8211, 150], [8212, 151], [8216, 145], [8217, 146], [8218, 130], [8220, 147], [8221, 148], [8222, 132], [8224, 134], [8225, 135], [8226, 149], [8230, 133], [8240, 137], [8249, 139], [8250, 155], [8364, 128], [8482, 153]]);

let decoder = (buffer: Buffer, encoding: string): string => {
  if (encoding === 'WINDOWS-1252' || encoding === 'CP1252') {
    let pureAscii = true;
    for (let i = 0; i !== buffer.length; ++i) {
      if (0x7F < buffer[i]) {
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

let encoder = (content: string, encoding: string): Buffer => {
  if (encoding === 'WINDOWS-1252' || encoding === 'CP1252') {
    let pureAscii = true;
    for (let i = 0; i !== content.length; ++i) {
      if (content[i].charCodeAt(0) >= 128) {
        pureAscii = false;
        break;
      }
    }
    if (pureAscii) {
      return Buffer.from(content, 'ascii');
    }
    const length = content.length;
    const result = new Uint16Array(length);
    for (let index = 0; index < length; index++) {
      const codePoint = content.charCodeAt(index);
      if (codePoint <= 0x7F) {
        result[index] = codePoint;
        continue;
      }
      result[index] = invCp1212.get(codePoint) ?? 0xFFFD;
    }
    return Buffer.from(result);
  }
  return Buffer.from(content, encoding as BufferEncoding);
};

export function setCodec(codec: {
  decode: (buffer: Buffer, encoding: string) => string;
  encode: (content: string, encoding: string) => Buffer;
}): void {
  decoder = codec.decode;
  encoder = codec.encode;
}

export function decode(buffer: Buffer, encoding: string): string {
  return decoder(buffer, encoding);
}
export function encode(content: string, encoding: string): Buffer {
  return encoder(content, encoding);
}
