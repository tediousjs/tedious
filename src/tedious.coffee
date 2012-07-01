require('pkginfo')(module)

versionParts = module.exports.version.match(/(\d+)\.(\d+)\.(\d+)/)
version =
  major: parseInt(versionParts[1])
  minor: parseInt(versionParts[2])
  patch: parseInt(versionParts[3])

exports.statemachineLogLevel = 0

exports.Connection = require('./connection')
exports.Request = require('./request')
exports.library = require('./library')
exports.TYPES = require('./data-type').typeByName
exports.version = version
