const TYPES = require('../../src/data-type');
const WritableTrackingBuffer = require('../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;

describe('Data Types', function() {
  // Test date calculation for non utc date during daylight savings period
  it('smallDateTimeDaylightSaving', () => {
    const type = TYPES.typeByName.SmallDateTime;
    for (const testSet of [
      [new Date(2015, 5, 18, 23, 59, 59), 42171],
      [new Date(2015, 5, 19, 0, 0, 0), 42172],
      [new Date(2015, 5, 19, 23, 59, 59), 42172],
      [new Date(2015, 5, 20, 0, 0, 0), 42173]
    ]) {
      const buffer = new WritableTrackingBuffer(8);
      const parameter = { value: testSet[0] };
      const expectedNoOfDays = testSet[1];
      type.writeParameterData(buffer, parameter, { useUTC: false }, () => {});
      assert.strictEqual(buffer.buffer.readUInt16LE(1), expectedNoOfDays);
    }
  });

  it('dateTimeDaylightSaving', () => {
    const type = TYPES.typeByName.DateTime;
    for (const testSet of [
      [new Date(2015, 5, 18, 23, 59, 59), 42171],
      [new Date(2015, 5, 19, 0, 0, 0), 42172],
      [new Date(2015, 5, 19, 23, 59, 59), 42172],
      [new Date(2015, 5, 20, 0, 0, 0), 42173]
    ]) {
      const buffer = new WritableTrackingBuffer(16);
      const parameter = { value: testSet[0] };
      const expectedNoOfDays = testSet[1];
      type.writeParameterData(buffer, parameter, { useUTC: false }, () => {});
      assert.strictEqual(buffer.buffer.readInt32LE(1), expectedNoOfDays);
    }
  });

  it('dateTime2DaylightSaving', () => {
    const type = TYPES.typeByName.DateTime2;
    for (const [value, expectedBuffer] of [
      [new Date(2015, 5, 18, 23, 59, 59), Buffer.from('067f5101163a0b', 'hex')],
      [new Date(2015, 5, 19, 0, 0, 0), Buffer.from('06000000173a0b', 'hex')],
      [new Date(2015, 5, 19, 23, 59, 59), Buffer.from('067f5101173a0b', 'hex')],
      [new Date(2015, 5, 20, 0, 0, 0), Buffer.from('06000000183a0b', 'hex')]
    ]) {
      const buffer = new WritableTrackingBuffer(16);
      type.writeParameterData(buffer, { value: value, scale: 0 }, { useUTC: false }, () => {});
      assert.deepEqual(buffer.data, expectedBuffer);
    }
  });

  it('dateDaylightSaving', () => {
    const type = TYPES.typeByName.Date;
    for (const [value, expectedBuffer] of [
      [new Date(2015, 5, 18, 23, 59, 59), Buffer.from('03163a0b', 'hex')],
      [new Date(2015, 5, 19, 0, 0, 0), Buffer.from('03173a0b', 'hex')],
      [new Date(2015, 5, 19, 23, 59, 59), Buffer.from('03173a0b', 'hex')],
      [new Date(2015, 5, 20, 0, 0, 0), Buffer.from('03183a0b', 'hex')]
    ]) {
      const buffer = new WritableTrackingBuffer(16);
      type.writeParameterData(buffer, { value: value }, { useUTC: false }, () => {});
      assert.deepEqual(buffer.data, expectedBuffer);
    }
  });

  // Test rounding of nanosecondDelta
  it('nanoSecondRounding', () => {
    const type = TYPES.typeByName.Time;
    for (const [value, nanosecondDelta, scale, expectedBuffer] of [
      [new Date(2017, 6, 29, 17, 20, 3, 503), 0.0006264, 7, Buffer.from('0568fc624b91', 'hex')],
      [new Date(2017, 9, 1, 1, 31, 4, 12), 0.0004612, 7, Buffer.from('05c422ceb80c', 'hex')],
      [new Date(2017, 7, 3, 12, 52, 28, 373), 0.0007118, 7, Buffer.from('051e94c8e96b', 'hex')]
    ]) {
      const parameter = { value: value, scale: scale };
      parameter.value.nanosecondDelta = nanosecondDelta;

      const buffer = new WritableTrackingBuffer(16);
      type.writeParameterData(buffer, parameter, { useUTC: false }, () => {});
      assert.deepEqual(buffer.data, expectedBuffer);
    }
  });

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
          expected: Buffer.from([ 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.TinyInt.toBuffer(parameter);
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
          expected: Buffer.from([ 0xD2, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.SmallInt.toBuffer(parameter);
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
          expected: Buffer.from([ 0x40, 0xE2, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.Int.toBuffer(parameter);
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
          expected: Buffer.from([ 0x15, 0xCD, 0x5B, 0x07, 0x00, 0x00, 0x00, 0x00 ]),
        },
        {
          name: 'value is a big int string',
          parameter: { value: '123456789' },
          expected: Buffer.from([ 0x15, 0xCD, 0x5B, 0x07, 0x00, 0x00, 0x00, 0x00 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.BigInt.toBuffer(parameter);
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
          expected: Buffer.from([ 0x2B, 0x52, 0x9A, 0x44 ]),
        },
        {
          name: 'value is a float string',
          parameter: { value: '1234.5678' },
          expected: Buffer.from([ 0x2B, 0x52, 0x9A, 0x44 ]),
        },
        {
          name: 'value is a float in scientific format',
          parameter: { value: '12345678e-4' },
          expected: Buffer.from([ 0x2B, 0x52, 0x9A, 0x44 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.Real.toBuffer(parameter);
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
          expected: Buffer.from([ 0xAD, 0xFA, 0x5C, 0x6D, 0x45, 0x4A, 0x93, 0x40 ]),
        },
        {
          name: 'value is a float string',
          parameter: { value: '1234.5678' },
          expected: Buffer.from([ 0xAD, 0xFA, 0x5C, 0x6D, 0x45, 0x4A, 0x93, 0x40 ]),
        },
        {
          name: 'value is a float in scientific format',
          parameter: { value: '12345678e-4' },
          expected: Buffer.from([ 0xAD, 0xFA, 0x5C, 0x6D, 0x45, 0x4A, 0x93, 0x40 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.Float.toBuffer(parameter);
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
          expected: Buffer.from([ 0x00, 0x00, 0x00, 0x00, 0x4E, 0x61, 0xBC, 0x00 ]),
        },
        {
          name: 'value is a float string',
          parameter: { value: '1234.5678' },
          expected: Buffer.from([ 0x00, 0x00, 0x00, 0x00, 0x4E, 0x61, 0xBC, 0x00 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.SmallMoney.toBuffer(parameter);
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
          expected: Buffer.from([ 0x1C, 0x00, 0x00, 0x00, 0xB2, 0xFB, 0x98, 0xBE ]),
        },
        {
          name: 'value is a float string',
          parameter: { value: '12345678.1234' },
          expected: Buffer.from([ 0x1C, 0x00, 0x00, 0x00, 0xB2, 0xFB, 0x98, 0xBE ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.Money.toBuffer(parameter);
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
          expected: Buffer.from([ 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
        {
          name: 'value is false',
          parameter: { value: false },
          expected: Buffer.from([ 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
        {
          name: 'value is truthy',
          parameter: { value: 'test' },
          expected: Buffer.from([ 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
        {
          name: 'value is falsy',
          parameter: { value: '' },
          expected: Buffer.from([ 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.Bit.toBuffer(parameter);
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
          expected: Buffer.from([ 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
        {
          name: 'value is false',
          parameter: { value: false },
          expected: Buffer.from([ 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
        {
          name: 'value is truthy',
          parameter: { value: 'test' },
          expected: Buffer.from([ 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
        {
          name: 'value is falsy',
          parameter: { value: '' },
          expected: Buffer.from([ 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.Bit.toBuffer(parameter);
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
          expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
        },
        {
          name: 'value is binary buffer',
          parameter: { value: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]) },
          expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.VarChar.toBuffer(parameter);
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
          expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
        },
        {
          name: 'value is binary buffer',
          parameter: { value: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]) },
          expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.Char.toBuffer(parameter);
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
          expected: Buffer.from([ 0x12, 0x00, 0x34, 0x00, 0x56, 0x00, 0x78, 0x00 ]),
        },
        {
          name: 'value is binary buffer',
          parameter: { value: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]) },
          expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.NVarChar.toBuffer(parameter);
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
          expected: Buffer.from([ 0x12, 0x00, 0x34, 0x00, 0x56, 0x00, 0x78, 0x00 ]),
        },
        {
          name: 'value is binary buffer',
          parameter: { value: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]) },
          expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.NChar.toBuffer(parameter);
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
          expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
        },
        {
          name: 'value is binary buffer',
          parameter: { value: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]) },
          expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.VarBinary.toBuffer(parameter);
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
          expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
        },
        {
          name: 'value is binary buffer',
          parameter: { value: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]) },
          expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.Binary.toBuffer(parameter);
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
          expected: Buffer.from([ 0x14, 0x64, 0xD0, 0x02 ]),
        },
        {
          name: 'value is local date, with use utc false',
          parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
          options: { useUTC: false },
          expected: Buffer.from([ 0x14, 0x64, 0xD0, 0x02 ]),
        },
      ].forEach(({ name, parameter, options, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.SmallDateTime.toBuffer(parameter, options);
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
          expected: Buffer.from([ 0x14, 0x64, 0x00, 0x00, 0x00, 0xC1, 0xC5, 0x00 ]),
        },
        {
          name: 'value is local date, with use utc false',
          parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
          options: { useUTC: false },
          expected: Buffer.from([ 0x14, 0x64, 0x00, 0x00, 0x00, 0xC1, 0xC5, 0x00 ]),
        },
      ].forEach(({ name, parameter, options, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.DateTime.toBuffer(parameter, options);
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
          expected: Buffer.from([ 0x00, 0xE0, 0x34, 0x95, 0x64 ]),
        },
        {
          name: 'value is local date, with use utc false',
          parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
          options: { useUTC: false },
          expected: Buffer.from([ 0x00, 0xE0, 0x34, 0x95, 0x64 ]),
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
          expected: Buffer.from([ 0x00, 0x55, 0xBA, 0x74, 0x67 ]),
        },
      ].forEach(({ name, parameter, options, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.Time.toBuffer(parameter, options);
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
          expected: Buffer.from([ 0x6F, 0xF9, 0x0A ]),
        },
        {
          name: 'value is local date, with use utc false',
          parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
          options: { useUTC: false },
          expected: Buffer.from([ 0x6F, 0xF9, 0x0A ]),
        },
      ].forEach(({ name, parameter, options, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.Date.toBuffer(parameter, options);
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
          expected: Buffer.from([ 0x00, 0xE0, 0x34, 0x95, 0x64, 0x6F, 0xF9, 0x0A ]),
        },
        {
          name: 'value is local date, with use utc false',
          parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
          options: { useUTC: false },
          expected: Buffer.from([ 0x00, 0xE0, 0x34, 0x95, 0x64, 0x6F, 0xF9, 0x0A ]),
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
          expected: Buffer.from([ 0x00, 0x55, 0xBA, 0x74, 0x67, 0x6F, 0xF9, 0x0A ]),
        },
      ].forEach(({ name, parameter, options, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.DateTime2.toBuffer(parameter, options);
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
          expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
        {
          name: 'value is a float string',
          parameter: { value: '1234.5678' },
          expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
        {
          name: 'value is a float in scientific format',
          parameter: { value: '12345678e-4' },
          expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
        {
          name: 'value is a float, with a specific scale',
          parameter: { value: 0.12345678, scale: 4 },
          expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.Numeric.toBuffer(parameter);
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
          expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
        {
          name: 'value is a float string',
          parameter: { value: '1234.5678' },
          expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
        {
          name: 'value is a float in scientific format',
          parameter: { value: '12345678e-4' },
          expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
        {
          name: 'value is a float, with a specific scale',
          parameter: { value: 0.12345678, scale: 4 },
          expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
        },
      ].forEach(({ name, parameter, expected }) => {
        it(name, () => {
          const actual = TYPES.typeByName.Decimal.toBuffer(parameter);
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
          const actual = TYPES.typeByName.UniqueIdentifier.toBuffer(parameter);
          assert.deepEqual(actual, expected);
        });
      });
    });
  });
});
