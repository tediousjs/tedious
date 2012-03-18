EventEmitter = require('events').EventEmitter

class Request extends EventEmitter
  constructor: (@sqlTextOrProcedure, @callback) ->
    @parameters = []

  addParameter: (type, name, value, options) ->
    if arguments.length < 4
      if typeof value == 'object'
        options = value
        value = undefined

    options ||= {}

    @parameters.push
      type: type
      name: name
      value: value
      output: options.output ||= false
      length: options.length

  addOutputParameter: (type, name, value, options) ->
    if arguments.length < 4
      if typeof value == 'object'
        options = value
        value = undefined

    options ||= {}
    options.output = true

    @addParameter(type, name, value, options)

module.exports = Request
