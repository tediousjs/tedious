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

  it('should buffer bigInt', () => {
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

  it('should buffer binary', () => {
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

  it('should buffer bit', ()=> {
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

  it('should buffer char', () => {
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
  
  it('should buffer dateTimeOffSet', () => {
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
});
