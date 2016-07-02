'use strict';

if (require('semver').lt(process.version, '4.0.0')) {
  require('babel-register');
}

require('coffee-script/register');
