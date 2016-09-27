'use strict';

const DeepCopy = require('../../src/helper-functions').DeepCopy;

exports.deepCopyOneLevel = function(test) {
  const source = { a: 5, c: 'something' };

  // Verify DeepCopy copies everything.
  let destination = DeepCopy(source);
  test.ok(JSON.stringify(source) === JSON.stringify(destination));

  // Verify changes to source don't affect destination.
  source.a = 6;
  test.ok(JSON.stringify(source) !== JSON.stringify(destination));

  // Verify changes to destination don't affect source.
  destination = DeepCopy(source);
  test.ok(JSON.stringify(source) === JSON.stringify(destination));
  destination.c = 'somethingelse';
  test.ok(JSON.stringify(source) !== JSON.stringify(destination));

  test.done();
};

exports.deepCopyTwoLevels = function(test) {
  const source = { a: 5, c: 'something', level2: { d: 3.4, e: true } };

  // Verify DeepCopy copies everything.
  let destination = DeepCopy(source);
  test.ok(JSON.stringify(source) === JSON.stringify(destination));

  // Verify changes to source don't affect destination.
  source.level2.d = 3.5;
  test.ok(JSON.stringify(source) !== JSON.stringify(destination));

  // Verify changes to destination don't affect source.
  destination = DeepCopy(source);
  test.ok(JSON.stringify(source) === JSON.stringify(destination));
  destination.level2.d = 4.5;
  test.ok(JSON.stringify(source) !== JSON.stringify(destination));

  test.done();
};

exports.deepCopyThreeLevels = function(test) {
  const source = { a: 5, c: 'something', level2: { d: 3.4, e: true, level3: { f: 3234532, g: 43215 } } };

  // Verify DeepCopy copies everything.
  let destination = DeepCopy(source);
  test.ok(JSON.stringify(source) === JSON.stringify(destination));

  // Verify changes to source don't affect destination.
  source.level2.level3.f = 1234;
  test.ok(JSON.stringify(source) !== JSON.stringify(destination));

  // Verify changes to source don't affect destination.
  destination = DeepCopy(source);
  test.ok(JSON.stringify(source) === JSON.stringify(destination));
  destination.level2.level3.f = 3456;
  test.ok(JSON.stringify(source) !== JSON.stringify(destination));

  test.done();
};
