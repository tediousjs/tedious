'use strict';

var ReadableTrackingBuffer, TYPES, WritableTrackingBuffer;

TYPES = require('../../src/data-type');

WritableTrackingBuffer = require('../../src/tracking-buffer/writable-tracking-buffer');

ReadableTrackingBuffer = require('../../src/tracking-buffer/readable-tracking-buffer');

exports.noTypeOverridesByAliases = function(test) {
  var alias, i, id, len, ref, ref1, ref2, type, typesByName;
  typesByName = {};
  ref = TYPES.TYPE;
  for (id in ref) {
    type = ref[id];
    typesByName[type.name] = type;
  }
  ref1 = TYPES.TYPE;
  for (id in ref1) {
    type = ref1[id];
    ref2 = type.aliases || [];
    for (i = 0, len = ref2.length; i < len; i++) {
      alias = ref2[i];
      test.ok(!typesByName[alias], 'Type ' + alias + ' already exist. ' + type.name + ' should not declare it as its alias.');
    }
  }
  return test.done();
};

exports.knownAliases = function(test) {
  var alias, i, len, ref;
  ref = ['UniqueIdentifier', 'Date', 'Time', 'DateTime2', 'DateTimeOffset'];
  for (i = 0, len = ref.length; i < len; i++) {
    alias = ref[i];
    test.strictEqual(TYPES.typeByName[alias], TYPES.typeByName[alias + 'N'], 'Alias ' + alias + ' is not pointing to ' + alias + 'N type.');
  }
  return test.done();
};

exports.smallDateTimeDaylightSaving = function(test) {
  var buffer, expectedNoOfDays, i, len, parameter, ref, testSet, type;
  type = TYPES.typeByName['SmallDateTime'];
  ref = [[new Date(2015, 5, 18, 23, 59, 59), 42171], [new Date(2015, 5, 19, 0, 0, 0), 42172], [new Date(2015, 5, 19, 23, 59, 59), 42172], [new Date(2015, 5, 20, 0, 0, 0), 42173]];
  for (i = 0, len = ref.length; i < len; i++) {
    testSet = ref[i];
    buffer = new WritableTrackingBuffer(8);
    parameter = {
      value: testSet[0]
    };
    expectedNoOfDays = testSet[1];
    type.writeParameterData(buffer, parameter, {
      useUTC: false
    });
    test.strictEqual(buffer.buffer.readUInt16LE(1), expectedNoOfDays);
  }
  return test.done();
};

exports.dateTimeDaylightSaving = function(test) {
  var buffer, expectedNoOfDays, i, len, parameter, ref, testSet, type;
  type = TYPES.typeByName['DateTime'];
  ref = [[new Date(2015, 5, 18, 23, 59, 59), 42171], [new Date(2015, 5, 19, 0, 0, 0), 42172], [new Date(2015, 5, 19, 23, 59, 59), 42172], [new Date(2015, 5, 20, 0, 0, 0), 42173]];
  for (i = 0, len = ref.length; i < len; i++) {
    testSet = ref[i];
    buffer = new WritableTrackingBuffer(16);
    parameter = {
      value: testSet[0]
    };
    expectedNoOfDays = testSet[1];
    type.writeParameterData(buffer, parameter, {
      useUTC: false
    });
    test.strictEqual(buffer.buffer.readInt32LE(1), expectedNoOfDays);
  }
  return test.done();
};

exports.dateTime2DaylightSaving = function(test) {
  var buffer, expectedNoOfDays, i, len, parameter, rBuffer, ref, testSet, type;
  type = TYPES.typeByName['DateTime2'];
  ref = [[new Date(2015, 5, 18, 23, 59, 59), 735766], [new Date(2015, 5, 19, 0, 0, 0), 735767], [new Date(2015, 5, 19, 23, 59, 59), 735767], [new Date(2015, 5, 20, 0, 0, 0), 735768]];
  for (i = 0, len = ref.length; i < len; i++) {
    testSet = ref[i];
    buffer = new WritableTrackingBuffer(16);
    parameter = {
      value: testSet[0],
      scale: 0
    };
    expectedNoOfDays = testSet[1];
    type.writeParameterData(buffer, parameter, {
      useUTC: false
    });
    rBuffer = new ReadableTrackingBuffer(buffer.buffer);
    rBuffer.readUInt8();
    rBuffer.readUInt24LE();
    test.strictEqual(rBuffer.readUInt24LE(), expectedNoOfDays);
  }
  return test.done();
};

exports.dateDaylightSaving = function(test) {
  var buffer, expectedNoOfDays, i, len, parameter, rBuffer, ref, testSet, type;
  type = TYPES.typeByName['Date'];
  ref = [[new Date(2015, 5, 18, 23, 59, 59), 735766], [new Date(2015, 5, 19, 0, 0, 0), 735767], [new Date(2015, 5, 19, 23, 59, 59), 735767], [new Date(2015, 5, 20, 0, 0, 0), 735768]];
  for (i = 0, len = ref.length; i < len; i++) {
    testSet = ref[i];
    buffer = new WritableTrackingBuffer(16);
    parameter = {
      value: testSet[0]
    };
    expectedNoOfDays = testSet[1];
    type.writeParameterData(buffer, parameter, {
      useUTC: false
    });
    rBuffer = new ReadableTrackingBuffer(buffer.buffer);
    rBuffer.readUInt8();
    test.strictEqual(rBuffer.readUInt24LE(), expectedNoOfDays);
  }
  return test.done();
};
