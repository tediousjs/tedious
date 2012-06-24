require('pkginfo')(module)

versionParts = module.exports.version.match(/(\d+)\.(\d+)\.(\d+)/)
version =
  major: versionParts[1]
  minor: versionParts[2]
  patch: versionParts[3]

exports.statemachineLogLevel = 0

exports.Connection = require('./connection')
exports.Request = require('./request')
exports.library = require('./library')
exports.TYPES = require('./data-type').typeByName
exports.version = version
