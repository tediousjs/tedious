'use strict';

// Based on: http://andrewdupont.net/2009/08/28/deep-extending-objects-in-javascript/
module.exports.DeepCopy = DeepCopy;
function DeepCopy(destination, source) {
  for (var property in source) {
    if (source[property]
      && source[property].constructor
      && source[property].constructor === Object) {
      destination[property] = destination[property] || {};
      DeepCopy(destination[property], source[property]);
    } else {
      destination[property] = source[property];
    }
  }
  return destination;
};
