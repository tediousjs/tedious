'use strict';

const CloneDeep = require('lodash.clonedeep');

// A trivial wrapper so we can catch any deviations from behavior we need.
module.exports.DeepCopy = DeepCopy;
function DeepCopy(source) {
  return CloneDeep(source);
}
