EventEmitter = require('events').EventEmitter

class Request extends EventEmitter
  constructor: (@sqlTextOrProcedure, @callback) ->
    @parameters = []

  addParameter: (type, name, value, output) ->
    output = output || false

    @parameters.push
      type: type
      name: name
      value: value
      output: output

  addOutputParameter: (type, name, value) ->
    @addOutputParameter(type, name, value, true)

module.exports = Request
