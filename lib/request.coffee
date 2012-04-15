EventEmitter = require('events').EventEmitter
TYPES = require('./data-type').typeByName

class Request extends EventEmitter
  constructor: (@sqlTextOrProcedure, @callback) ->
    @parameters = []

  addParameter: (name, type, value, options) ->
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

  addOutputParameter: (name, type, value, options) ->
    if arguments.length < 4
      if typeof value == 'object'
        options = value
        value = undefined

    options ||= {}
    options.output = true

    @addParameter(name, type, value, options)

  transformIntoExecuteSqlRpc: () ->
    modifiedParameters = []

    modifiedParameters.push
      type: TYPES.NVarChar
      name: 'statement'
      value: @sqlTextOrProcedure

    paramsParameter = ''
    for parameter in @parameters
      if paramsParameter.length > 0
        paramsParameter += ', '
      paramsParameter += "@#{parameter.name} "
      paramsParameter += parameter.type.declaration()
      if parameter.output
        paramsParameter += ' OUTPUT'

    modifiedParameters.push
      type: TYPES.NVarChar
      name: 'params'
      value: paramsParameter

    for parameter in @parameters
      modifiedParameters.push(parameter)

    @parameters = modifiedParameters

    @sqlTextOrProcedure = 'sp_executesql'

module.exports = Request
