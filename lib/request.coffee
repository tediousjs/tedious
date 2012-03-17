EventEmitter = require('events').EventEmitter

class Request extends EventEmitter
  constructor: (@sqlTextOrProcedure, @callback) ->
    @parameters = []

  addParameter: (type, name, value) ->
    @parameters.push
      type: type
      name: name
      value: value

module.exports = Request
