EventEmitter = require('events').EventEmitter

class Request extends EventEmitter
  constructor: (@sqlText, @callback) ->

module.exports = Request
