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
      const parameter = { value: testSet[0] };
      const expectedNoOfDays = testSet[1];
      type.writeParameterData(null, parameter, { useUTC: false }, (data) => {
        assert.strictEqual(data[0].readInt32LE(1), expectedNoOfDays);
      });
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
      type.writeParameterData(null, { value: value, scale: 0 }, { useUTC: false }, (data) => {
        assert.deepEqual(data[0], expectedBuffer);
      });
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
      type.writeParameterData(null, { value: value }, { useUTC: false }, (data) => {
        assert.deepEqual(data[0], expectedBuffer);
      });
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

  it('should writeParameterData bigInt', () => {
    const bigInt = TYPES.typeByName.BigInt;
    const parameterValue = {value: 123456789 }
    const expectedValue = Buffer.from('0815cd5b0700000000','hex')
    bigInt.writeParameterData(null, parameterValue, null, (data)=>{
      assert.isTrue(data[0].equals(expectedValue))
    });  

    const parameterNull = {value: null};
    const expectedNull = Buffer.from('00','hex')
    bigInt.writeParameterData(null, parameterNull, null, (data)=>{
      assert.isTrue(data[0].equals(expectedNull))
    });  
  })

  it('should writeParameterData binary', () => {
    const binary = TYPES.typeByName.Binary;
    const parameterValue = {length: 4, value: Buffer.from([0x12, 0x34, 0x00, 0x00])}
    const expectedValue = Buffer.from('040012340000', 'hex')
    binary.writeParameterData(null, parameterValue, null, (data) => {
      assert.isTrue(data[0].equals(expectedValue));
    })

    const parameterNull = {value: null}
    const expectedNull = Buffer.from('ffff', 'hex');
    binary.writeParameterData(null, parameterNull, null, (data) => {
      assert.isTrue(data[0].equals(expectedNull));
    })
  })

  it('should writeParameterData bit', ()=> {
    const bit = TYPES.typeByName.Bit;
    const parameterNull = {value: null};
    const parameterUndefined = {}
    const expectedNull = Buffer.from('00', 'hex'); 
    bit.writeParameterData(null, parameterNull, null, (data) => {
      assert.isTrue(data[0].equals(expectedNull));
    })
    bit.writeParameterData(null, parameterUndefined, null, (data) => {
      assert.isTrue(data[0].equals(expectedNull));
    })

    const parameterValue = {value: 1};
    const expectedValue = Buffer.from('0101', 'hex')
    bit.writeParameterData(null, parameterValue, null, (data) => {
      assert.isTrue(data[0].equals(expectedValue));
    })
  })

  it('should writeParameterData char', () => {
    const char = TYPES.typeByName.Char;
    const parameterValue = {length: 4, value: Buffer.from([0xff, 0xff, 0xff, 0xff])}
    const expectedValue = Buffer.from('0400ffffffff', 'hex')
    char.writeParameterData(null, parameterValue, null, (data) => {
      assert.isTrue(data[0].equals(expectedValue));
    })

    const parameterNull = {value: null}
    const expectedNull = Buffer.from('ffff', 'hex');
    char.writeParameterData(null, parameterNull, null, (data) => {
      assert.isTrue(data[0].equals(expectedNull));
    })
  })  
  
  it('should writeParameterData dateTimeOffSet', () => {
    const type = TYPES.typeByName.DateTimeOffset;
    const parameterValue = { value: new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999)), scale: 0 };
    const expectedValue = Buffer.from('0820fd002d380b20fe', 'hex')
    type.writeParameterData(null, parameterValue, { useUTC: false }, (done) => {
      assert.isTrue(done[0].equals(expectedValue));
    });
        
    const parameterNull = { value: null };
    const expectedNull = Buffer.from('00', 'hex')
    type.writeParameterData(null, parameterNull, { useUTC: false }, (done) => {
      assert.isTrue(done[0].equals(expectedNull));
    });   
  });

  it('should writeParameterData decimal', () => {
    const type = TYPES.typeByName.Decimal;
    const value = 1.23;
       
    for(const [precision, expected] of [
      [1, Buffer.from('050101000000', 'hex')],
      [15, Buffer.from('09010100000000000000', 'hex')],
      [25, Buffer.from('0d01010000000000000000000000', 'hex')],
      [30, Buffer.from('110101000000000000000000000000000000', 'hex')]
    ]) {
      const parameterValue = {value, precision, scale: 0};
      type.writeParameterData(null, parameterValue, {useUTC: false}, (done) => {
        assert.isTrue(done[0].equals(expected));
      })
    }
  });

  it('should writeParameterData float', () => {
    const type = TYPES.typeByName.Float;
       
    for(const [value, expected] of [
      [1.2345, Buffer.from('088d976e1283c0f33f', 'hex')],
      [null, Buffer.from('00', 'hex')],
    ]) {
      const parameterValue = {value};
      type.writeParameterData(null, parameterValue, {useUTC: false}, (done) => {
        assert.isTrue(done[0].equals(expected))
      })
    }
  });

  it('should writeParameterData image', () => {
    const type = TYPES.typeByName.Image;
       
    for(const [value, expected] of [
      [Buffer.from('010101', 'hex'), Buffer.from('64000000010101', 'hex')],
      [null, Buffer.from('64000000', 'hex')],
    ]) {
      const parameterValue = {length: 100, value};
      type.writeParameterData(null, parameterValue, {useUTC: false}, (done) => {
        assert.isTrue(done[0].equals(expected));
      })
    }
  })

  it('should writeParameterData int', () => {
    const type = TYPES.typeByName.Int;
       
    for(const [value, expected] of [
      [1234, Buffer.from('04d2040000', 'hex')],
      [null, Buffer.from('00', 'hex')],
    ]) {
      const parameterValue = {value};
      type.writeParameterData(null, parameterValue, {useUTC: false}, (done) => {
        assert.isTrue(done[0].equals(expected))
      })
    }
  })

  it('should writeParameterData money', () => {
    const type = TYPES.typeByName.Money;
       
    for(const [value, expected] of [
      [1234, Buffer.from('0800000000204bbc00', 'hex')],
      [null, Buffer.from('00', 'hex')],
    ]) {
      const parameterValue = {value};
      type.writeParameterData(null, parameterValue, {useUTC: false}, (done) => {
        assert.isTrue(done[0].equals(expected))
      })
    }
  })

  it('should writeParameterData nchar', () => {
    const type = TYPES.typeByName.NChar;
       
    for(const [value, expected] of [
      [Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from('0400ffffffff', 'hex')],
      [null, Buffer.from('ffff', 'hex')],
    ]) {
      const parameterValue = {value};
      type.writeParameterData(null, parameterValue, {useUTC: false}, (done) => {
        assert.isTrue(done[0].equals(expected))
      })
    }
  })

  it('should writeParameterData numeric', () => {
    const type = TYPES.typeByName.Numeric;
    const value = 1.23;
       
    for(const [precision, expected] of [
      [1, Buffer.from('050101000000', 'hex')],
      [15, Buffer.from('09010100000000000000', 'hex')],
      [25, Buffer.from('0d01010000000000000000000000', 'hex')],
      [30, Buffer.from('110101000000000000000000000000000000', 'hex')]
    ]) {
      const parameterValue = {value, precision, scale: 0};
      type.writeParameterData(null, parameterValue, {useUTC: false}, (done) => {
        assert.isTrue(done[0].equals(expected));
      })
    }
  });

  it('should writeParameterData nvarchar', () => {
    const type = TYPES.typeByName.NVarChar;
    for(const [value, length, expected] of [
      [Buffer.from([0xff, 0xff]), 1, Buffer.from('0200ffff', 'hex')],
      [Buffer.from([0xff, 0xff]), 4100, Buffer.from('feffffffffffffff02000000ffff00000000', 'hex')],
      [null, 1, Buffer.from('ffff', 'hex')],
      [null, 5000, Buffer.from('ffffffffffffffff', 'hex')]
    ]) {
      const parameterValue = {value, length};
      type.writeParameterData(null, parameterValue, {useUTC: false}, (done) => {
        assert.isTrue(done[0].equals(expected));
      })
    }
  });
});
