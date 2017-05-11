var TYPES = require('../../src/data-type');
var WritableTrackingBuffer = require('../../src/tracking-buffer/writable-tracking-buffer');
var ReadableTrackingBuffer = require('../../src/tracking-buffer/readable-tracking-buffer');

exports.noTypeOverridesByAliases = function(test) {
  var type;
  var typesByName = {};
  for (var id in TYPES.TYPE) {
    type = TYPES.TYPE[id];
    typesByName[type.name] = type;
  }

  for (id in TYPES.TYPE) {
    type = TYPES.TYPE[id];
    for (var alias of type.aliases || []) {
      test.ok(
        !typesByName[alias],
        `Type ${alias} already exist. ${type.name} should not declare it as its alias.`
      );
    }
  }

  return test.done();
};

// Test some aliases
exports.knownAliases = function(test) {
  for (var alias of [
    'UniqueIdentifier',
    'Date',
    'Time',
    'DateTime2',
    'DateTimeOffset'
  ]) {
    test.strictEqual(
      TYPES.typeByName[alias],
      TYPES.typeByName[`${alias}N`],
      `Alias ${alias} is not pointing to ${alias}N type.`
    );
  }

  return test.done();
};

// Test date calculation for non utc date during daylight savings period
exports.smallDateTimeDaylightSaving = function(test) {
  var type = TYPES.typeByName['SmallDateTime'];
  for (var testSet of [
    [new Date(2015, 5, 18, 23, 59, 59), 42171],
    [new Date(2015, 5, 19, 0, 0, 0), 42172],
    [new Date(2015, 5, 19, 23, 59, 59), 42172],
    [new Date(2015, 5, 20, 0, 0, 0), 42173]
  ]) {
    var buffer = new WritableTrackingBuffer(8);
    var parameter = { value: testSet[0] };
    var expectedNoOfDays = testSet[1];
    type.writeParameterData(buffer, parameter, { useUTC: false });
    test.strictEqual(buffer.buffer.readUInt16LE(1), expectedNoOfDays);
  }
  return test.done();
};

exports.dateTimeDaylightSaving = function(test) {
  var type = TYPES.typeByName['DateTime'];
  for (var testSet of [
    [new Date(2015, 5, 18, 23, 59, 59), 42171],
    [new Date(2015, 5, 19, 0, 0, 0), 42172],
    [new Date(2015, 5, 19, 23, 59, 59), 42172],
    [new Date(2015, 5, 20, 0, 0, 0), 42173]
  ]) {
    var buffer = new WritableTrackingBuffer(16);
    var parameter = { value: testSet[0] };
    var expectedNoOfDays = testSet[1];
    type.writeParameterData(buffer, parameter, { useUTC: false });
    test.strictEqual(buffer.buffer.readInt32LE(1), expectedNoOfDays);
  }
  return test.done();
};

exports.dateTime2DaylightSaving = function(test) {
  var type = TYPES.typeByName['DateTime2'];
  for (var testSet of [
    [new Date(2015, 5, 18, 23, 59, 59), 735766],
    [new Date(2015, 5, 19, 0, 0, 0), 735767],
    [new Date(2015, 5, 19, 23, 59, 59), 735767],
    [new Date(2015, 5, 20, 0, 0, 0), 735768]
  ]) {
    var buffer = new WritableTrackingBuffer(16);
    var parameter = { value: testSet[0], scale: 0 };
    var expectedNoOfDays = testSet[1];
    type.writeParameterData(buffer, parameter, { useUTC: false });
    var rBuffer = new ReadableTrackingBuffer(buffer.buffer);
    rBuffer.readUInt8();
    rBuffer.readUInt24LE();
    test.strictEqual(rBuffer.readUInt24LE(), expectedNoOfDays);
  }
  return test.done();
};

exports.dateDaylightSaving = function(test) {
  var type = TYPES.typeByName['Date'];
  for (var testSet of [
    [new Date(2015, 5, 18, 23, 59, 59), 735766],
    [new Date(2015, 5, 19, 0, 0, 0), 735767],
    [new Date(2015, 5, 19, 23, 59, 59), 735767],
    [new Date(2015, 5, 20, 0, 0, 0), 735768]
  ]) {
    var buffer = new WritableTrackingBuffer(16);
    var parameter = { value: testSet[0] };
    var expectedNoOfDays = testSet[1];
    type.writeParameterData(buffer, parameter, { useUTC: false });
    var rBuffer = new ReadableTrackingBuffer(buffer.buffer);
    rBuffer.readUInt8();
    test.strictEqual(rBuffer.readUInt24LE(), expectedNoOfDays);
  }
  return test.done();
};
