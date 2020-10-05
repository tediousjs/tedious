const TYPES = require('../../src/data-type').typeByName;

const { assert } = require('chai');

describe('DataType.toBuffer', () => {
  const emptyBuffer = Buffer.from([]);
  const plpNullBuffer = Buffer.from([
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  ]);

  const undefinedValueCase = {
    name: 'value is undefined',
    parameter: {},
    expected: emptyBuffer,
  };
  const nullValueCase = {
    name: 'value is null',
    parameter: { value: null },
    expected: emptyBuffer,
  };

  describe('TinyInt.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a tiny int',
        parameter: { value: 12 },
        expected: Buffer.from([0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.TinyInt.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('SmallInt.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a small int',
        parameter: { value: 1234 },
        expected: Buffer.from([0xD2, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.SmallInt.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Int.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is an int',
        parameter: { value: 123456 },
        expected: Buffer.from([0x40, 0xE2, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.Int.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('BigInt.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a big int number',
        parameter: { value: 123456789 },
        expected: Buffer.from([0x15, 0xCD, 0x5B, 0x07, 0x00, 0x00, 0x00, 0x00]),
      },
      {
        name: 'value is a big int string',
        parameter: { value: '123456789' },
        expected: Buffer.from([0x15, 0xCD, 0x5B, 0x07, 0x00, 0x00, 0x00, 0x00]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.BigInt.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Real.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a float number',
        parameter: { value: 1234.5678 },
        expected: Buffer.from([0x2B, 0x52, 0x9A, 0x44]),
      },
      {
        name: 'value is a float string',
        parameter: { value: '1234.5678' },
        expected: Buffer.from([0x2B, 0x52, 0x9A, 0x44]),
      },
      {
        name: 'value is a float in scientific format',
        parameter: { value: '12345678e-4' },
        expected: Buffer.from([0x2B, 0x52, 0x9A, 0x44]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.Real.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Float.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a float number',
        parameter: { value: 1234.5678 },
        expected: Buffer.from([0xAD, 0xFA, 0x5C, 0x6D, 0x45, 0x4A, 0x93, 0x40]),
      },
      {
        name: 'value is a float string',
        parameter: { value: '1234.5678' },
        expected: Buffer.from([0xAD, 0xFA, 0x5C, 0x6D, 0x45, 0x4A, 0x93, 0x40]),
      },
      {
        name: 'value is a float in scientific format',
        parameter: { value: '12345678e-4' },
        expected: Buffer.from([0xAD, 0xFA, 0x5C, 0x6D, 0x45, 0x4A, 0x93, 0x40]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.Float.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('SmallMoney.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a float number',
        parameter: { value: 1234.5678 },
        expected: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x4E, 0x61, 0xBC, 0x00]),
      },
      {
        name: 'value is a float string',
        parameter: { value: '1234.5678' },
        expected: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x4E, 0x61, 0xBC, 0x00]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.SmallMoney.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Money.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a float number',
        parameter: { value: 12345678.1234 },
        expected: Buffer.from([0x1C, 0x00, 0x00, 0x00, 0xB2, 0xFB, 0x98, 0xBE]),
      },
      {
        name: 'value is a float string',
        parameter: { value: '12345678.1234' },
        expected: Buffer.from([0x1C, 0x00, 0x00, 0x00, 0xB2, 0xFB, 0x98, 0xBE]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.Money.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Bit.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is true',
        parameter: { value: true },
        expected: Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
      {
        name: 'value is false',
        parameter: { value: false },
        expected: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
      {
        name: 'value is truthy',
        parameter: { value: 'test' },
        expected: Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
      {
        name: 'value is falsy',
        parameter: { value: '' },
        expected: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.Bit.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Bit.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is true',
        parameter: { value: true },
        expected: Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
      {
        name: 'value is false',
        parameter: { value: false },
        expected: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
      {
        name: 'value is truthy',
        parameter: { value: 'test' },
        expected: Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
      {
        name: 'value is falsy',
        parameter: { value: '' },
        expected: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.Bit.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('VarChar.toBuffer', () => {
    [
      { ...undefinedValueCase, expected: plpNullBuffer },
      { ...nullValueCase, expected: plpNullBuffer },
      {
        name: 'value is empty string',
        parameter: { value: '' },
        expected: emptyBuffer,
      },
      {
        name: 'value is empty buffer',
        parameter: { value: emptyBuffer },
        expected: emptyBuffer,
      },
      {
        name: 'value is printable string',
        parameter: { value: 'test' },
        expected: Buffer.from('test'),
      },
      {
        name: 'value is binary string',
        parameter: { value: '\x12\x34\x56\x78' },
        expected: Buffer.from([0x12, 0x34, 0x56, 0x78]),
      },
      {
        name: 'value is binary buffer',
        parameter: { value: Buffer.from([0x12, 0x34, 0x56, 0x78]) },
        expected: Buffer.from([0x12, 0x34, 0x56, 0x78]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.VarChar.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Char.toBuffer', () => {
    [
      { ...undefinedValueCase, expected: plpNullBuffer },
      { ...nullValueCase, expected: plpNullBuffer },
      {
        name: 'value is empty string',
        parameter: { value: '' },
        expected: emptyBuffer,
      },
      {
        name: 'value is empty buffer',
        parameter: { value: emptyBuffer },
        expected: emptyBuffer,
      },
      {
        name: 'value is printable string',
        parameter: { value: 'test' },
        expected: Buffer.from('test'),
      },
      {
        name: 'value is binary string',
        parameter: { value: '\x12\x34\x56\x78' },
        expected: Buffer.from([0x12, 0x34, 0x56, 0x78]),
      },
      {
        name: 'value is binary buffer',
        parameter: { value: Buffer.from([0x12, 0x34, 0x56, 0x78]) },
        expected: Buffer.from([0x12, 0x34, 0x56, 0x78]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.Char.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('NVarChar.toBuffer', () => {
    [
      { ...undefinedValueCase, expected: plpNullBuffer },
      { ...nullValueCase, expected: plpNullBuffer },
      {
        name: 'value is empty string',
        parameter: { value: '' },
        expected: emptyBuffer,
      },
      {
        name: 'value is empty buffer',
        parameter: { value: emptyBuffer },
        expected: emptyBuffer,
      },
      {
        name: 'value is printable string',
        parameter: { value: 'test' },
        expected: Buffer.from('test', 'ucs2'),
      },
      {
        name: 'value is binary string',
        parameter: { value: '\x12\x34\x56\x78' },
        expected: Buffer.from([0x12, 0x00, 0x34, 0x00, 0x56, 0x00, 0x78, 0x00]),
      },
      {
        name: 'value is binary buffer',
        parameter: { value: Buffer.from([0x12, 0x34, 0x56, 0x78]) },
        expected: Buffer.from([0x12, 0x34, 0x56, 0x78]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.NVarChar.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('NChar.toBuffer', () => {
    [
      { ...undefinedValueCase, expected: plpNullBuffer },
      { ...nullValueCase, expected: plpNullBuffer },
      {
        name: 'value is empty string',
        parameter: { value: '' },
        expected: emptyBuffer,
      },
      {
        name: 'value is empty buffer',
        parameter: { value: emptyBuffer },
        expected: emptyBuffer,
      },
      {
        name: 'value is printable string',
        parameter: { value: 'test' },
        expected: Buffer.from('test', 'ucs2'),
      },
      {
        name: 'value is binary string',
        parameter: { value: '\x12\x34\x56\x78' },
        expected: Buffer.from([0x12, 0x00, 0x34, 0x00, 0x56, 0x00, 0x78, 0x00]),
      },
      {
        name: 'value is binary buffer',
        parameter: { value: Buffer.from([0x12, 0x34, 0x56, 0x78]) },
        expected: Buffer.from([0x12, 0x34, 0x56, 0x78]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.NChar.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('VarBinary.toBuffer', () => {
    [
      { ...undefinedValueCase, expected: plpNullBuffer },
      { ...nullValueCase, expected: plpNullBuffer },
      {
        name: 'value is empty string',
        parameter: { value: '' },
        expected: emptyBuffer,
      },
      {
        name: 'value is empty buffer',
        parameter: { value: emptyBuffer },
        expected: emptyBuffer,
      },
      {
        name: 'value is printable string',
        parameter: { value: 'test' },
        expected: Buffer.from('test'),
      },
      {
        name: 'value is binary string',
        parameter: { value: '\x12\x34\x56\x78' },
        expected: Buffer.from([0x12, 0x34, 0x56, 0x78]),
      },
      {
        name: 'value is binary buffer',
        parameter: { value: Buffer.from([0x12, 0x34, 0x56, 0x78]) },
        expected: Buffer.from([0x12, 0x34, 0x56, 0x78]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.VarBinary.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Binary.toBuffer', () => {
    [
      { ...undefinedValueCase, expected: plpNullBuffer },
      { ...nullValueCase, expected: plpNullBuffer },
      {
        name: 'value is empty string',
        parameter: { value: '' },
        expected: emptyBuffer,
      },
      {
        name: 'value is empty buffer',
        parameter: { value: emptyBuffer },
        expected: emptyBuffer,
      },
      {
        name: 'value is printable string',
        parameter: { value: 'test' },
        expected: Buffer.from('test'),
      },
      {
        name: 'value is binary string',
        parameter: { value: '\x12\x34\x56\x78' },
        expected: Buffer.from([0x12, 0x34, 0x56, 0x78]),
      },
      {
        name: 'value is binary buffer',
        parameter: { value: Buffer.from([0x12, 0x34, 0x56, 0x78]) },
        expected: Buffer.from([0x12, 0x34, 0x56, 0x78]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.Binary.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('SmallDateTime.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is utc date, with use utc true',
        parameter: { value: new Date(Date.UTC(1970, 1, 23, 12, 0, 0)) },
        options: { useUTC: true },
        expected: Buffer.from([0x14, 0x64, 0xD0, 0x02]),
      },
      {
        name: 'value is local date, with use utc false',
        parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
        options: { useUTC: false },
        expected: Buffer.from([0x14, 0x64, 0xD0, 0x02]),
      },
    ].forEach(({ name, parameter, options, expected }) => {
      it(name, () => {
        const actual = TYPES.SmallDateTime.toBuffer(parameter, options);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('DateTime.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is utc date, with use utc true',
        parameter: { value: new Date(Date.UTC(1970, 1, 23, 12, 0, 0)) },
        options: { useUTC: true },
        expected: Buffer.from([0x14, 0x64, 0x00, 0x00, 0x00, 0xC1, 0xC5, 0x00]),
      },
      {
        name: 'value is local date, with use utc false',
        parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
        options: { useUTC: false },
        expected: Buffer.from([0x14, 0x64, 0x00, 0x00, 0x00, 0xC1, 0xC5, 0x00]),
      },
    ].forEach(({ name, parameter, options, expected }) => {
      it(name, () => {
        const actual = TYPES.DateTime.toBuffer(parameter, options);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Time.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is utc date, with use utc true',
        parameter: { value: new Date(Date.UTC(1970, 1, 23, 12, 0, 0)) },
        options: { useUTC: true },
        expected: Buffer.from([0x00, 0xE0, 0x34, 0x95, 0x64]),
      },
      {
        name: 'value is local date, with use utc false',
        parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
        options: { useUTC: false },
        expected: Buffer.from([0x00, 0xE0, 0x34, 0x95, 0x64]),
      },
      {
        name: 'value is local date, with nanoseconds',
        parameter: {
          value: Object.assign(
            new Date(1970, 1, 23, 12, 0, 0),
            { nanosecondDelta: 1234 },
          ),
        },
        options: { useUTC: false },
        expected: Buffer.from([0x00, 0x55, 0xBA, 0x74, 0x67]),
      },
    ].forEach(({ name, parameter, options, expected }) => {
      it(name, () => {
        const actual = TYPES.Time.toBuffer(parameter, options);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Date.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is utc date, with use utc true',
        parameter: { value: new Date(Date.UTC(1970, 1, 23, 12, 0, 0)) },
        options: { useUTC: true },
        expected: Buffer.from([0x6F, 0xF9, 0x0A]),
      },
      {
        name: 'value is local date, with use utc false',
        parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
        options: { useUTC: false },
        expected: Buffer.from([0x6F, 0xF9, 0x0A]),
      },
    ].forEach(({ name, parameter, options, expected }) => {
      it(name, () => {
        const actual = TYPES.Date.toBuffer(parameter, options);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('DateTime2.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is utc date, with use utc true',
        parameter: { value: new Date(Date.UTC(1970, 1, 23, 12, 0, 0)) },
        options: { useUTC: true },
        expected: Buffer.from([0x00, 0xE0, 0x34, 0x95, 0x64, 0x6F, 0xF9, 0x0A]),
      },
      {
        name: 'value is local date, with use utc false',
        parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
        options: { useUTC: false },
        expected: Buffer.from([0x00, 0xE0, 0x34, 0x95, 0x64, 0x6F, 0xF9, 0x0A]),
      },
      {
        name: 'value is local date, with nanoseconds',
        parameter: {
          value: Object.assign(
            new Date(1970, 1, 23, 12, 0, 0),
            { nanosecondDelta: 1234 },
          ),
        },
        options: { useUTC: false },
        expected: Buffer.from([0x00, 0x55, 0xBA, 0x74, 0x67, 0x6F, 0xF9, 0x0A]),
      },
    ].forEach(({ name, parameter, options, expected }) => {
      it(name, () => {
        const actual = TYPES.DateTime2.toBuffer(parameter, options);
        assert.deepEqual(actual, expected);
      });
    });
  });

  // DateTimeOffset is already tested by Date, and only has the additional time-zone offset
  // Adding a portable, dynamic test for it wouldn't really be testing much, so skip it

  describe('Numeric.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a float number',
        parameter: { value: 1234.5678 },
        expected: Buffer.from([0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
      {
        name: 'value is a float string',
        parameter: { value: '1234.5678' },
        expected: Buffer.from([0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
      {
        name: 'value is a float in scientific format',
        parameter: { value: '12345678e-4' },
        expected: Buffer.from([0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
      {
        name: 'value is a float, with a specific scale',
        parameter: { value: 0.12345678, scale: 4 },
        expected: Buffer.from([0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.Numeric.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Decimal.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a float number',
        parameter: { value: 1234.5678 },
        expected: Buffer.from([0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
      {
        name: 'value is a float string',
        parameter: { value: '1234.5678' },
        expected: Buffer.from([0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
      {
        name: 'value is a float in scientific format',
        parameter: { value: '12345678e-4' },
        expected: Buffer.from([0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
      {
        name: 'value is a float, with a specific scale',
        parameter: { value: 0.12345678, scale: 4 },
        expected: Buffer.from([0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.Decimal.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('UniqueIdentifier.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is an upper-case guid',
        parameter: { value: 'ABCD1234-ABCD-1234-ABCD-1234567890AB' },
        expected: Buffer.from([
          0x34, 0x12, 0xCD, 0xAB, 0xCD, 0xAB, 0x34, 0x12,
          0xAB, 0xCD, 0x12, 0x34, 0x56, 0x78, 0x90, 0xAB,
        ]),
      },
      {
        name: 'value is a lower-case guid',
        parameter: { value: 'abcd1234-abcd-1234-abcd-1234567890ab' },
        expected: Buffer.from([
          0x34, 0x12, 0xCD, 0xAB, 0xCD, 0xAB, 0x34, 0x12,
          0xAB, 0xCD, 0x12, 0x34, 0x56, 0x78, 0x90, 0xAB,
        ]),
      },
      {
        name: 'value is a mixed-case guid',
        parameter: { value: 'ABcd1234-aBcD-1234-AbCd-1234567890ab' },
        expected: Buffer.from([
          0x34, 0x12, 0xCD, 0xAB, 0xCD, 0xAB, 0x34, 0x12,
          0xAB, 0xCD, 0x12, 0x34, 0x56, 0x78, 0x90, 0xAB,
        ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.UniqueIdentifier.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });
});

describe('BigInt', function() {
  describe('.generateParameterData', function() {
    it('correctly converts `number` values', function() {
      const value = 123456789;
      const expected = Buffer.from('0815cd5b0700000000', 'hex');

      const parameterValue = { value, length: 4 };
      const buffer = Buffer.concat([...TYPES.BigInt.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `string` values', function() {
      const value = '123456789';
      const expected = Buffer.from('0815cd5b0700000000', 'hex');

      const parameterValue = { value, length: 4 };
      const buffer = Buffer.concat([...TYPES.BigInt.generateParameterData(parameterValue, { useUTC: false })]);

      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([0x00]);

      const parameterValue = { value, length: 4 };

      const buffer = Buffer.concat([...TYPES.BigInt.generateParameterData(parameterValue, { useUTC: false })]);

      assert.deepEqual(buffer, expected);
    });
    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const expected = Buffer.from([0x26, 8]);

        const result = TYPES.BigInt.generateTypeInfo();
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('Binary', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `Buffer` values', function() {
        const value = Buffer.from([0x12, 0x34, 0x00, 0x00]);
        const expected = Buffer.from('040012340000', 'hex');
        const parameterValue = { value, length: 4 };

        const buffer = Buffer.concat([...TYPES.Binary.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('ffff', 'hex');
        const parameterValue = { value, length: 4 };

        const buffer = Buffer.concat([...TYPES.Binary.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.Binary;
        const parameter = { length: 1 };

        const expected = Buffer.from([0xAD, 1, 0]);

        const result = type.generateTypeInfo(parameter);
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('Bit', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `number` values', function() {
        const value = 1;
        const expected = Buffer.from('0101', 'hex');
        const parameterValue = { value };

        const buffer = Buffer.concat([...TYPES.Bit.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('00', 'hex');
        const parameterValue = { value };

        const buffer = Buffer.concat([...TYPES.Bit.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `undefined` values', function() {
        const value = undefined;
        const expected = Buffer.from('00', 'hex');
        const parameterValue = { value };

        const buffer = Buffer.concat([...TYPES.Bit.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const expected = Buffer.from([0x68, 1]);

        const result = TYPES.Bit.generateTypeInfo();
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('Char', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `Buffer` values', function() {
        const value = Buffer.from([0xff, 0xff, 0xff, 0xff]);
        const expected = Buffer.from('0400ffffffff', 'hex');
        const parameterValue = { value };

        const buffer = Buffer.concat([...TYPES.Char.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('ffff', 'hex');
        const parameterValue = { value };

        const buffer = Buffer.concat([...TYPES.Char.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const expected = Buffer.from([0xAF, 1, 0, 0x00, 0x00, 0x00, 0x00, 0x00]);

        const result = TYPES.Char.generateTypeInfo({ length: 1 });
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('Date', function() {
    describe('.generateParameterData', function() {
      it('correctly converts dates during daylight savings period', function() {
        for (const [value, expectedBuffer] of [
          [new Date(2015, 5, 18, 23, 59, 59), Buffer.from('03163a0b', 'hex')],
          [new Date(2015, 5, 19, 0, 0, 0), Buffer.from('03173a0b', 'hex')],
          [new Date(2015, 5, 19, 23, 59, 59), Buffer.from('03173a0b', 'hex')],
          [new Date(2015, 5, 20, 0, 0, 0), Buffer.from('03183a0b', 'hex')]
        ]) {
          const buffer = Buffer.concat([...TYPES.Date.generateParameterData({ value: value }, { useUTC: false })]);
          assert.deepEqual(buffer, expectedBuffer);
        }
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.Date;
        const expected = Buffer.from([0x28]);

        const result = type.generateTypeInfo();
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('DateTime', function() {
    describe('.generateParameterData', function() {
      it('correctly converts dates during daylight savings period', function() {
        for (const testSet of [
          [new Date(2015, 5, 18, 23, 59, 59), 42171],
          [new Date(2015, 5, 19, 0, 0, 0), 42172],
          [new Date(2015, 5, 19, 23, 59, 59), 42172],
          [new Date(2015, 5, 20, 0, 0, 0), 42173]
        ]) {
          const parameter = { value: testSet[0] };
          const expectedNoOfDays = testSet[1];
          const buffer = Buffer.concat([...TYPES.DateTime.generateParameterData(parameter, { useUTC: false })]);
          assert.strictEqual(buffer.readInt32LE(1), expectedNoOfDays);
        }
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.DateTime;
        const expected = Buffer.from([0x6F, 8]);

        const result = type.generateTypeInfo();
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('DateTime2', function() {
    describe('.generateParameterData', function() {
      it('correctly converts dates during daylight savings period', () => {
        for (const [value, expectedBuffer] of [
          [new Date(2015, 5, 18, 23, 59, 59), Buffer.from('067f5101163a0b', 'hex')],
          [new Date(2015, 5, 19, 0, 0, 0), Buffer.from('06000000173a0b', 'hex')],
          [new Date(2015, 5, 19, 23, 59, 59), Buffer.from('067f5101173a0b', 'hex')],
          [new Date(2015, 5, 20, 0, 0, 0), Buffer.from('06000000183a0b', 'hex')]
        ]) {
          const buffer = Buffer.concat([...TYPES.DateTime2.generateParameterData({ value: value, scale: 0 }, { useUTC: false })]);
          assert.deepEqual(buffer, expectedBuffer);
        }
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const expected = Buffer.from([0x2A, 1]);

        const buffer = TYPES.DateTime2.generateTypeInfo({ scale: 1 });
        assert.deepEqual(buffer, expected);
      });
    });
  });

  describe('DateTimeOffset', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `Date` values', function() {
        const value = new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999));
        const expected = Buffer.from('0820fd002d380b', 'hex');
        const parameterValue = { value, scale: 0 };

        const buffer = Buffer.concat([...TYPES.DateTimeOffset.generateParameterData(parameterValue, { useUTC: true })]);
        assert.deepEqual(buffer.slice(0, 7), expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('00', 'hex');

        const parameterValue = { value, scale: 0 };
        const buffer = Buffer.concat([...TYPES.DateTimeOffset.generateParameterData(parameterValue, { useUTC: true })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const expected = Buffer.from([0x2B, 1]);

        const buffer = TYPES.DateTimeOffset.generateTypeInfo({ scale: 1 });
        assert.deepEqual(buffer, expected);
      });
    });
  });

  describe('Decimal', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `number` values (Precision <= 9)', function() {
        const value = 1.23;
        const expected = Buffer.from('050101000000', 'hex');
        const precision = 1;

        const type = TYPES.Decimal;
        const parameterValue = { value, precision, scale: 0 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `number` values (Precision <= 19)', function() {
        const value = 1.23;
        const expected = Buffer.from('09010100000000000000', 'hex');
        const precision = 15;

        const type = TYPES.Decimal;
        const parameterValue = { value, precision, scale: 0 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `number` values (Precision <= 28)', function() {
        const value = 1.23;
        const expected = Buffer.from('0d01010000000000000000000000', 'hex');
        const precision = 25;

        const type = TYPES.Decimal;
        const parameterValue = { value, precision, scale: 0 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });


      it('correctly converts `number` values (Precision > 28)', function() {
        const value = 1.23;
        const expected = Buffer.from('110101000000000000000000000000000000', 'hex');
        const precision = 30;

        const type = TYPES.Decimal;
        const parameterValue = { value, precision, scale: 0 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.Decimal;

        // Precision <= 9
        const expected1 = Buffer.from([0x6A, 5, 1, 1]);
        const result = type.generateTypeInfo({ precision: 1, scale: 1 });
        assert.deepEqual(result, expected1);

        // Precision <= 19
        const expected2 = Buffer.from([0x6A, 9, 15, 1]);
        const result2 = type.generateTypeInfo({ precision: 15, scale: 1 });
        assert.deepEqual(result2, expected2);


        // Precision <= 28
        const expected3 = Buffer.from([0x6A, 13, 20, 1]);
        const result3 = type.generateTypeInfo({ precision: 20, scale: 1 });
        assert.deepEqual(result3, expected3);

        // Precision > 28
        const expected4 = Buffer.from([0x6A, 17, 30, 1]);
        const result4 = type.generateTypeInfo({ precision: 30, scale: 1 });
        assert.deepEqual(result4, expected4);
      });
    });
  });

  describe('Float', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `number` values', function() {
        const value = 1.2345;
        const expected = Buffer.from('088d976e1283c0f33f', 'hex');

        const type = TYPES.Float;
        const parameterValue = { value, scale: 0 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('00', 'hex');

        const type = TYPES.Float;
        const parameterValue = { value, scale: 0 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.Float;
        const expected = Buffer.from([0x6D, 8]);

        const result = type.generateTypeInfo();
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('Image', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `Buffer` values', function() {
        const value = Buffer.from('010101', 'hex');
        const expected = Buffer.from('64000000010101', 'hex');

        const type = TYPES.Image;
        const parameterValue = { value, length: 100 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('64000000', 'hex');

        const type = TYPES.Image;
        const parameterValue = { value, length: 100 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.Image;
        const expected = Buffer.from([0x22, 1, 0, 0, 0]);

        const result = type.generateTypeInfo({ length: 1 });
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('Int', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `number` values', function() {
        const value = 1234;
        const expected = Buffer.from('04d2040000', 'hex');

        const type = TYPES.Int;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('00', 'hex');

        const type = TYPES.Int;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.Int;
        const expected = Buffer.from([0x26, 4]);

        const result = type.generateTypeInfo();
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('Money', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `number` values', function() {
        const value = 1234;
        const expected = Buffer.from('0800000000204bbc00', 'hex');

        const type = TYPES.Money;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('00', 'hex');

        const type = TYPES.Money;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.Money;
        const expected = Buffer.from([0x6E, 8]);

        const result = type.generateTypeInfo();
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('NChar', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `Buffer` values', function() {
        const value = Buffer.from([0xff, 0xff, 0xff, 0xff]);
        const expected = Buffer.from('0400ffffffff', 'hex');

        const type = TYPES.NChar;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('ffff', 'hex');

        const type = TYPES.NChar;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.NChar;
        const expected = Buffer.from([0xEF, 2, 0, 0x00, 0x00, 0x00, 0x00, 0x00]);

        const result = type.generateTypeInfo({ length: 1 });
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('Numeric', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `number` values (Precision <= 9)', function() {
        const value = 1.23;
        const expected = Buffer.from('050101000000', 'hex');
        const precision = 1;

        const type = TYPES.Numeric;
        const parameterValue = { value, precision, scale: 0 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `number` values (Precision <= 19)', function() {
        const value = 1.23;
        const expected = Buffer.from('09010100000000000000', 'hex');
        const precision = 15;

        const type = TYPES.Numeric;
        const parameterValue = { value, precision, scale: 0 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `number` values (Precision <= 28)', function() {
        const value = 1.23;
        const expected = Buffer.from('0d01010000000000000000000000', 'hex');
        const precision = 25;

        const type = TYPES.Numeric;
        const parameterValue = { value, precision, scale: 0 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `number` values (Precision > 28)', function() {
        const value = 1.23;
        const expected = Buffer.from('110101000000000000000000000000000000', 'hex');
        const precision = 30;

        const type = TYPES.Numeric;
        const parameterValue = { value, precision, scale: 0 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.Numeric;

        // Precision <= 9
        const expected1 = Buffer.from([0x6C, 5, 1, 1]);
        const result = type.generateTypeInfo({ precision: 1, scale: 1 });
        assert.deepEqual(result, expected1);

        // Precision <= 19
        const expected2 = Buffer.from([0x6C, 9, 15, 1]);
        const result2 = type.generateTypeInfo({ precision: 15, scale: 1 });
        assert.deepEqual(result2, expected2);

        // Precision <= 28
        const expected3 = Buffer.from([0x6C, 13, 20, 1]);
        const result3 = type.generateTypeInfo({ precision: 20, scale: 1 });
        assert.deepEqual(result3, expected3);

        // Precision > 28
        const expected4 = Buffer.from([0x6C, 17, 30, 1]);
        const result4 = type.generateTypeInfo({ precision: 30, scale: 1 });
        assert.deepEqual(result4, expected4);
      });
    });
  });

  describe('NVarChar', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `Buffer` values (Length <= Maximum Length)', function() {
        const value = Buffer.from([0xff, 0xff]);
        const expected = Buffer.from('0200ffff', 'hex');
        const length = 1;

        const type = TYPES.NVarChar;
        const parameterValue = { value, length };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `Buffer` values (Length > Maximum Length)', function() {
        const value = Buffer.from([0xff, 0xff]);
        const expected = Buffer.from('feffffffffffffff02000000ffff00000000', 'hex');
        const length = 4100;

        const type = TYPES.NVarChar;
        const parameterValue = { value, length };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values (Length <= Maximum Length)', function() {
        const value = null;
        const expected = Buffer.from('ffff', 'hex');
        const length = 1;

        const type = TYPES.NVarChar;
        const parameterValue = { value, length };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values (Length > Maximum Length)', function() {
        const value = null;
        const expected = Buffer.from('ffffffffffffffff', 'hex');
        const length = 5000;

        const type = TYPES.NVarChar;
        const parameterValue = { value, length };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        // Length <= Maximum Length
        const type = TYPES.NVarChar;
        const expected = Buffer.from([0xE7, 2, 0, 0x00, 0x00, 0x00, 0x00, 0x00]);

        const result = type.generateTypeInfo({ length: 1 });
        assert.deepEqual(result, expected);

        // Length > Maximum Length
        const expected1 = Buffer.from([0xE7, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00]);

        const result2 = type.generateTypeInfo({ length: 4100 });
        assert.deepEqual(result2, expected1);
      });
    });
  });

  describe('Real', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `number` values', function() {
        const value = 123.123;
        const expected = Buffer.from('04fa3ef642', 'hex');

        const type = TYPES.Real;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('00', 'hex');

        const type = TYPES.Real;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.Real;
        const expected = Buffer.from([0x6D, 4]);

        const result = type.generateTypeInfo();
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('SmallDateTime', function() {
    describe('.generateParameterData', function() {
      it('correctly converts dates during daylight savings period', function() {
        for (const [value, expectedNoOfDays] of [
          [new Date(2015, 5, 18, 23, 59, 59), 42171],
          [new Date(2015, 5, 19, 0, 0, 0), 42172],
          [new Date(2015, 5, 19, 23, 59, 59), 42172],
          [new Date(2015, 5, 20, 0, 0, 0), 42173]
        ]) {
          const buffer = Buffer.concat([...TYPES.SmallDateTime.generateParameterData({ value }, { useUTC: false })]);

          assert.strictEqual(buffer.readUInt16LE(1), expectedNoOfDays);
        }
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const expected = Buffer.from([0x6F, 0x04]);
        const result = TYPES.SmallDateTime.generateTypeInfo();

        assert.deepEqual(result, expected);
      });
    });
  });

  describe('SmallInt', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `number` values', function() {
        const value = 2;
        const expected = Buffer.from('020200', 'hex');

        const type = TYPES.SmallInt;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('00', 'hex');

        const type = TYPES.SmallInt;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.SmallInt;
        const expected = Buffer.from([0x26, 2]);

        const result = type.generateTypeInfo();
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('SmallMoney', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `number` values', function() {
        const value = 2;
        const expected = Buffer.from('04204e0000', 'hex');

        const type = TYPES.SmallMoney;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('00', 'hex');

        const type = TYPES.SmallMoney;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.SmallMoney;
        const expected = Buffer.from([0x6E, 4]);

        const result = type.generateTypeInfo();
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('Text', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `Buffer` values', function() {
        const value = Buffer.from('Hello World', 'ascii');
        const expected = Buffer.from('00000000000f00000048656c6c6f20576f726c64', 'hex');

        const type = TYPES.Text;
        const parameterValue = { value, length: 15 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('00000000000f000000', 'hex');

        const type = TYPES.Text;
        const parameterValue = { value, length: 15 };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.Text;
        const expected = Buffer.from([0x23, 1, 0, 0, 0]);

        const result = type.generateTypeInfo({ length: 1 });
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('Time', function() {
    describe('.generateParameterData', function() {
      // Test rounding of nanosecondDelta
      it('correctly converts `Date` values with a `nanosecondDelta` property', () => {
        const type = TYPES.Time;
        for (const [value, nanosecondDelta, scale, expectedBuffer] of [
          [new Date(2017, 6, 29, 17, 20, 3, 503), 0.0006264, 7, Buffer.from('0568fc624b91', 'hex')],
          [new Date(2017, 9, 1, 1, 31, 4, 12), 0.0004612, 7, Buffer.from('05c422ceb80c', 'hex')],
          [new Date(2017, 7, 3, 12, 52, 28, 373), 0.0007118, 7, Buffer.from('051e94c8e96b', 'hex')]
        ]) {
          const parameter = { value: value, scale: scale };
          parameter.value.nanosecondDelta = nanosecondDelta;

          const buffer = Buffer.concat([...type.generateParameterData(parameter, { useUTC: false }, () => { })]);
          assert.deepEqual(buffer, expectedBuffer);
        }
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.Time;
        const expected = Buffer.from([0x29, 1]);

        const reuslt = type.generateTypeInfo({ scale: 1 });
        assert.deepEqual(reuslt, expected);
      });
    });
  });

  describe('TinyInt', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `number` values', function() {
        const value = 1;
        const expected = Buffer.from('0101', 'hex');

        const type = TYPES.TinyInt;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;
        const expected = Buffer.from('00', 'hex');

        const type = TYPES.TinyInt;
        const parameterValue = { value };

        const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const type = TYPES.TinyInt;
        const expected = Buffer.from([0x26, 1]);

        const result = type.generateTypeInfo();
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('TVP', function() {
    describe('.generateParameterData', function() {
      it('correctly converts TVP table values', function() {
        const value = {
          columns: [{ name: 'user_id', type: TYPES.Int }],
          rows: [[15]]
        };
        const expected = Buffer.from('01000000000000002604000001040f00000000', 'hex');
        const parameterValue = { value };

        const buffer = Buffer.concat([...TYPES.TVP.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;

        const expected = Buffer.from('ffff0000', 'hex');
        const parameterValue = { value };

        const buffer = Buffer.concat([...TYPES.TVP.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const expected = Buffer.from([0xF3, 0x00, 0x00, 0x00]);

        const result = TYPES.TVP.generateTypeInfo({ value: null });
        assert.deepEqual(result, expected);
      });
    });
  });

  describe('UniqueIdentifier', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `string` values', function() {
        const value = 'e062ae34-6de5-47f3-8ba3-29d25f77e71a';

        const expected = Buffer.from('1034ae62e0e56df3478ba329d25f77e71a', 'hex');
        const parameterValue = { value };

        const buffer = Buffer.concat([...TYPES.UniqueIdentifier.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values', function() {
        const value = null;

        const expected = Buffer.from('00', 'hex');
        const parameterValue = { value };

        const buffer = Buffer.concat([...TYPES.UniqueIdentifier.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        const expected = Buffer.from([0x24, 0x10]);

        const result = TYPES.UniqueIdentifier.generateTypeInfo();
        assert.deepEqual(result, expected);
      });
    });

    describe('.validate', function() {
      it('returns the given value for values that match the UUID format', function() {
        const expected = 'e062ae34-6de5-47f3-8ba3-29d25f77e71a';
        const actual = TYPES.UniqueIdentifier.validate(expected);
        assert.strictEqual(actual, expected);
      });

      it('returns a TypeError for values that don\'t matcht the UUID format', function() {
        const result = TYPES.UniqueIdentifier.validate('invalid');
        assert.instanceOf(result, TypeError);
        assert.strictEqual(result.message, 'Invalid GUID.');
      });
    });
  });

  describe('VarBinary', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `null` values', () => {
        for (const [value, length, expected] of [
          [null, 1, Buffer.from('ffff', 'hex')],
          [null, 9000, Buffer.from('FFFFFFFFFFFFFFFF', 'hex')]
        ]) {
          const parameterValue = { value, length };
          const buffer = Buffer.concat([...TYPES.VarBinary.generateParameterData(parameterValue, { useUTC: false }, () => { })]);
          assert.deepEqual(buffer, expected);
        }
      });

      it('correctly converts `number` values', () => {
        for (const [value, length, expected] of [
          [1, 1, Buffer.from('02003100', 'hex')],
        ]) {
          const parameterValue = { value, length };
          const buffer = Buffer.concat([...TYPES.VarBinary.generateParameterData(parameterValue, { useUTC: false }, () => { })]);
          assert.deepEqual(buffer, expected);
        }
      });

      it('correctly converts `number` values (Length <= Maximum Length)', function() {
        const value = 1;
        const length = 1;
        const expected = Buffer.from('02003100', 'hex'); const parameterValue = { value, length };

        const buffer = Buffer.concat([...TYPES.VarBinary.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `number` values (Length > Maximum Length)', function() {
        const value = 1;
        const length = 9000;
        const expected = Buffer.from('feffffffffffffff02000000310000000000', 'hex');
        const parameterValue = { value, length };

        const buffer = Buffer.concat([...TYPES.VarBinary.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values (Length <= Maximum Length)', function() {
        const value = null;
        const length = 1;
        const expected = Buffer.from('ffff', 'hex'); const parameterValue = { value, length };

        const buffer = Buffer.concat([...TYPES.VarBinary.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values (Length > Maximum Length)', function() {
        const value = null;
        const length = 9000;
        const expected = Buffer.from('FFFFFFFFFFFFFFFF', 'hex'); const parameterValue = { value, length };

        const buffer = Buffer.concat([...TYPES.VarBinary.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        // Length <= Maximum Length
        const expected = Buffer.from([0xA5, 0x01, 0x00]);

        const result = TYPES.VarBinary.generateTypeInfo({ length: 1 });
        assert.deepEqual(result, expected);

        // Length > Maximum Length
        const expected1 = Buffer.from([0xA5, 0x40, 0x1f]);

        const result1 = TYPES.VarBinary.generateTypeInfo({ length: 8500 });
        assert.deepEqual(result1, expected1);
      });
    });
  });

  describe('VarChar', function() {
    describe('.generateParameterData', function() {
      it('correctly converts `string` values (Length <= Maximum Length)', function() {
        const value = 'hello world';
        const length = 1;
        const expected = Buffer.from('0b0068656c6c6f20776f726c64', 'hex'); const parameterValue = { value, length };

        const buffer = Buffer.concat([...TYPES.VarChar.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `string` values (Length > Maximum Length)', function() {
        const value = 'hello world';
        const length = 9000;
        const expected = Buffer.from('feffffffffffffff0b00000068656c6c6f20776f726c6400000000', 'hex'); const parameterValue = { value, length };

        const buffer = Buffer.concat([...TYPES.VarChar.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `null` values (Length <= Maximum Length)', function() {
        const value = null;
        const length = 1;
        const expected = Buffer.from('ffff', 'hex'); const parameterValue = { value, length };

        const buffer = Buffer.concat([...TYPES.VarChar.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });

      it('correctly converts `string` values (Length > Maximum Length)', function() {
        const value = null;
        const length = 9000;
        const expected = Buffer.from('FFFFFFFFFFFFFFFF', 'hex'); const parameterValue = { value, length };

        const buffer = Buffer.concat([...TYPES.VarChar.generateParameterData(parameterValue, { useUTC: false })]);
        assert.deepEqual(buffer, expected);
      });
    });

    describe('.generateTypeInfo', function() {
      it('returns the correct type information', function() {
        // Length <= Maximum Length
        const expected = Buffer.from('a7401f0000000000', 'hex');

        const result = TYPES.VarChar.generateTypeInfo({ length: 1 });
        assert.deepEqual(result, expected);

        // Length > Maximum Length
        const expected1 = Buffer.from('a7ffff0000000000', 'hex');

        const result2 = TYPES.VarChar.generateTypeInfo({ length: 8500 });
        assert.deepEqual(result2, expected1);
      });
    });
  });
});
