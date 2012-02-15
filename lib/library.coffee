fs = require('fs')
path = require('path')

exports.name = 'Tedious'

packageJsonFile = path.dirname(module.filename) + '/../package.json'
exports.version = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8')).version
