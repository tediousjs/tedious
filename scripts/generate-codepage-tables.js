// Generates `src/codepage-tables.ts` from Microsoft's mapping tables, which
// the Unicode Consortium publishes at
// https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/ under the Unicode
// License v3 (https://www.unicode.org/license.txt).
//
// Usage: node scripts/generate-codepage-tables.js [directory]
//
// Reads the tables from `directory` if given (as bestfit<N>.txt, cp437.txt and
// cp850.txt), or downloads them otherwise.

'use strict';

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT';

const SINGLE_BYTE = [
  ['CP437', 'PC/CP437.TXT', 'cp437.txt'],
  ['CP850', 'PC/CP850.TXT', 'cp850.txt'],
  ['CP874', 'WindowsBestFit/bestfit874.txt', 'bestfit874.txt'],
  ['CP1250', 'WindowsBestFit/bestfit1250.txt', 'bestfit1250.txt'],
  ['CP1251', 'WindowsBestFit/bestfit1251.txt', 'bestfit1251.txt'],
  ['CP1252', 'WindowsBestFit/bestfit1252.txt', 'bestfit1252.txt'],
  ['CP1253', 'WindowsBestFit/bestfit1253.txt', 'bestfit1253.txt'],
  ['CP1254', 'WindowsBestFit/bestfit1254.txt', 'bestfit1254.txt'],
  ['CP1255', 'WindowsBestFit/bestfit1255.txt', 'bestfit1255.txt'],
  ['CP1256', 'WindowsBestFit/bestfit1256.txt', 'bestfit1256.txt'],
  ['CP1257', 'WindowsBestFit/bestfit1257.txt', 'bestfit1257.txt'],
  ['CP1258', 'WindowsBestFit/bestfit1258.txt', 'bestfit1258.txt']
];

const DOUBLE_BYTE = [
  ['CP932', 'WindowsBestFit/bestfit932.txt', 'bestfit932.txt'],
  ['CP936', 'WindowsBestFit/bestfit936.txt', 'bestfit936.txt'],
  ['CP949', 'WindowsBestFit/bestfit949.txt', 'bestfit949.txt'],
  ['CP950', 'WindowsBestFit/bestfit950.txt', 'bestfit950.txt']
];

async function load(directory, url, file) {
  if (directory) {
    return fs.readFileSync(path.join(directory, file), 'latin1');
  }

  const response = await fetch(`${BASE_URL}/${url}`);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer()).toString('latin1');
}

// Parses a PC/CP*.TXT table: lines of "0xBB 0xUUUU #NAME".
function parsePcTable(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^0x([0-9A-Fa-f]{2})\s+0x([0-9A-Fa-f]{4})/.exec(line);
    if (match) {
      map.set(parseInt(match[1], 16), parseInt(match[2], 16));
    }
  }
  return map;
}

// Parses the multi-byte to Unicode part of a WindowsBestFit table: the MBTABLE
// section, the lead byte ranges of the DBCSRANGE section (each a line marked
// "Lead Byte Range", followed by the DBCSTABLE sections of its lead bytes),
// and a DBCSTABLE section for each lead byte.
function parseBestFit(text) {
  const single = new Map();
  const pairs = new Map();
  const leadRanges = [];
  let defaultChar;
  let section;
  let lead;

  for (const line of text.split(/\r?\n/)) {
    const words = line.replace(/;.*/, '').trim().split(/\s+/);
    const keyword = words[0].toUpperCase();

    if (keyword === 'CPINFO') {
      defaultChar = parseInt(words[3], 16);
      section = undefined;
    } else if (keyword === 'MBTABLE') {
      section = 'mb';
    } else if (keyword === 'DBCSRANGE') {
      section = undefined;
    } else if (/;\s*Lead Byte Range/i.test(line)) {
      leadRanges.push([parseInt(words[0], 16), parseInt(words[1], 16)]);
      section = undefined;
    } else if (keyword === 'DBCSTABLE') {
      const match = /LeadByte = 0x([0-9a-f]{2})/i.exec(line);
      lead = match && parseInt(match[1], 16);
      if (lead === null || !leadRanges.some(([first, last]) => lead >= first && lead <= last) || pairs.has(lead)) {
        throw new Error(`Unexpected DBCSTABLE: ${line}`);
      }
      section = 'dbcs';
      pairs.set(lead, new Map());
    } else if (keyword === 'WCTABLE' || keyword === 'ENDCODEPAGE' || keyword === 'CODEPAGE') {
      section = undefined;
    } else if (/^0x/i.test(keyword) && section !== undefined) {
      const [from, to] = [parseInt(words[0], 16), parseInt(words[1], 16)];
      if (section === 'mb') {
        single.set(from, to);
      } else {
        pairs.get(lead).set(from, to);
      }
    }
  }

  return { single, pairs, leadRanges, defaultChar };
}

function hex(value, width) {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

function escape(code) {
  return '\\u' + code.toString(16).toUpperCase().padStart(4, '0');
}

// The Unicode License v3, which the tables are under. A comment with
// `@license`, so that bundlers keep it with the tables.
const LICENSE = `/**
 * @license
 * The code page tables in this file are derived from data files of the Unicode
 * Consortium, which are under this license:
 *
 * UNICODE LICENSE V3
 *
 * COPYRIGHT AND PERMISSION NOTICE
 *
 * Copyright © 1991-2026 Unicode, Inc.
 *
 * NOTICE TO USER: Carefully read the following legal agreement. BY
 * DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
 * SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
 * TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
 * DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of data files and any associated documentation (the "Data Files") or
 * software and any associated documentation (the "Software") to deal in the
 * Data Files or Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, and/or sell
 * copies of the Data Files or Software, and to permit persons to whom the
 * Data Files or Software are furnished to do so, provided that either (a)
 * this copyright and permission notice appear with all copies of the Data
 * Files or Software, or (b) this copyright and permission notice appear in
 * associated Documentation.
 *
 * THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
 * KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
 * THIRD PARTY RIGHTS.
 *
 * IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
 * BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
 * OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
 * WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
 * ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
 * FILES OR SOFTWARE.
 *
 * Except as contained in this notice, the name of a copyright holder shall
 * not be used in advertising or otherwise to promote the sale, use or other
 * dealings in these Data Files or Software without prior written
 * authorization of the copyright holder.
 */
`;

const NOTICE = LICENSE + `
// Generated by \`scripts/generate-codepage-tables.js\` from Microsoft's mapping
// tables for these code pages, published by the Unicode Consortium at
// https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/:
// WindowsBestFit/bestfit<N>.txt (the MBTABLE and DBCSTABLE sections) for the
// Windows code pages, and PC/CP437.TXT and PC/CP850.TXT for the OEM code pages.
`;

async function main() {
  const directory = process.argv[2];
  let out = NOTICE + `
// The upper halves (bytes 0x80 to 0xFF) of the single-byte code pages, as
// Windows' MultiByteToWideChar decodes them. The lower halves are ASCII in
// every one of these code pages. Each string holds 128 UTF-16 code units: the
// character for byte 0x80 + i is at index i.

export const SINGLE_BYTE_HIGH_HALVES: { readonly [codepage: string]: string } = {
`;

  const singles = [];
  for (const [codepage, url, file] of SINGLE_BYTE) {
    const text = await load(directory, url, file);
    const map = file.startsWith('cp') ? parsePcTable(text) : parseBestFit(text).single;
    for (let byte = 0; byte < 0x80; byte++) {
      if (map.get(byte) !== byte) {
        throw new Error(`${codepage}: byte ${hex(byte, 2)} is not ASCII`);
      }
    }

    const lines = [];
    for (let row = 0x80; row <= 0xF0; row += 0x10) {
      let codes = '';
      for (let byte = row; byte < row + 0x10; byte++) {
        if (!map.has(byte)) {
          throw new Error(`${codepage}: byte ${hex(byte, 2)} has no mapping`);
        }
        codes += escape(map.get(byte));
      }
      lines.push(`    '${codes}'`);
    }
    singles.push(`  ${codepage}:\n` + lines.map((line, i) => line + (i < lines.length - 1 ? ' + // ' : ', // ') + hex(0x80 + i * 0x10, 2)).join('\n'));
  }
  out += singles.join('\n') + '\n};\n';

  out += `
// The double-byte code pages, as Windows' MultiByteToWideChar decodes them.
// Bytes 0x00 to 0x7F are ASCII in every one of these code pages.
//
// - \`leadBytes\`: the ranges of bytes that start a two-byte sequence.
// - \`defaultChar\`: what an invalid sequence decodes to.
// - \`data\`: base64 of little-endian 16-bit values, each a UTF-16 code unit or
//   0 for no character: first one for each byte from 0x80 to 0xFF (0 for a
//   lead byte), then, for each lead byte in order, one for each trail byte
//   from 0x40 to 0xFE.

export interface DoubleByteTable {
  readonly leadBytes: ReadonlyArray<readonly [first: number, last: number]>;
  readonly defaultChar: number;
  readonly data: string;
}

export const DOUBLE_BYTE_TABLES: { readonly [codepage: string]: DoubleByteTable } = {
`;

  const doubles = [];
  for (const [codepage, url, file] of DOUBLE_BYTE) {
    const { single, pairs, leadRanges, defaultChar } = parseBestFit(await load(directory, url, file));
    for (let byte = 0; byte < 0x80; byte++) {
      if (single.get(byte) !== byte) {
        throw new Error(`${codepage}: byte ${hex(byte, 2)} is not ASCII`);
      }
    }

    const leads = [];
    for (const [first, last] of leadRanges) {
      for (let lead = first; lead <= last; lead++) {
        if (!pairs.has(lead)) {
          throw new Error(`${codepage}: lead byte ${hex(lead, 2)} has no DBCSTABLE`);
        }
        leads.push(lead);
      }
    }
    if (leads.length !== pairs.size) {
      throw new Error(`${codepage}: a DBCSTABLE is outside of the lead byte ranges`);
    }

    const codes = [];
    for (let byte = 0x80; byte <= 0xFF; byte++) {
      codes.push(leads.includes(byte) ? 0 : (single.get(byte) ?? 0));
    }
    for (const lead of leads) {
      const trails = pairs.get(lead);
      for (const trail of trails.keys()) {
        if (trail < 0x40 || trail > 0xFE) {
          throw new Error(`${codepage}: sequence ${hex((lead << 8) | trail, 4)} is out of range`);
        }
      }
      for (let trail = 0x40; trail <= 0xFE; trail++) {
        codes.push(trails.get(trail) ?? 0);
      }
    }

    const data = Buffer.alloc(codes.length * 2);
    codes.forEach((code, i) => data.writeUInt16LE(code, i * 2));
    const base64 = data.toString('base64');
    const lines = [];
    for (let i = 0; i < base64.length; i += 96) {
      lines.push(`      '${base64.slice(i, i + 96)}'`);
    }

    let entry = `  ${codepage}: {\n`;
    entry += `    leadBytes: [${leadRanges.map(([first, last]) => `[${hex(first, 2)}, ${hex(last, 2)}]`).join(', ')}],\n`;
    entry += `    defaultChar: ${hex(defaultChar, 4)},\n`;
    entry += `    data:\n${lines.join(' +\n')}\n  }`;
    doubles.push(entry);
  }
  out += doubles.join(',\n') + '\n};\n';

  fs.writeFileSync(path.join(__dirname, '..', 'src', 'codepage-tables.ts'), out);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
