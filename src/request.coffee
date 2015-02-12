EventEmitter = require('events').EventEmitter
TYPES = require('./data-type').typeByName

{RequestError} = require('./errors')

class Request extends EventEmitter
  error: null
  canceled: false
  
  constructor: (@sqlTextOrProcedure, @callback) ->
    @parameters = []
    @parametersByName = {}

    @userCallback = @callback
    @callback = ->
      if @preparing
        @emit('prepared')
        @preparing = false
      else
        @userCallback.apply(@, arguments)
        @emit('requestCompleted')

  addParameter: (name, type, value, options = {}) ->
    parameter =
      type: type
      name: name
      value: value
      output: options.output ||= false
      length: options.length
      precision: options.precision
      scale: options.scale

    @parameters.push(parameter)
    @parametersByName[name] = parameter

  addOutputParameter: (name, type, value, options = {}) ->
    options.output = true

    @addParameter(name, type, value, options)

  makeParamsParameter: (parameters) ->
    paramsParameter = ''
    for parameter in parameters
      if paramsParameter.length > 0
        paramsParameter += ', '
      paramsParameter += "@#{parameter.name} "
      paramsParameter += parameter.type.declaration(parameter)
      if parameter.output
        paramsParameter += ' OUTPUT'

    paramsParameter

  transformIntoExecuteSqlRpc: () ->
    if @validateParameters() then return
  	
    @originalParameters = @parameters
    @parameters = []

    @addParameter('statement', TYPES.NVarChar, @sqlTextOrProcedure)
    if (@originalParameters.length)
      @addParameter('params', TYPES.NVarChar, @makeParamsParameter(@originalParameters))

    for parameter in @originalParameters
      @parameters.push(parameter)

    @sqlTextOrProcedure = 'sp_executesql'

  transformIntoPrepareRpc: () ->
    @originalParameters = @parameters
    @parameters = []

    @addOutputParameter('handle', TYPES.Int)
    @addParameter('params', TYPES.NVarChar, @makeParamsParameter(@originalParameters))
    @addParameter('stmt', TYPES.NVarChar, @sqlTextOrProcedure)

    @sqlTextOrProcedure = 'sp_prepare'

    @preparing = true

    @on('returnValue', (name, value, metadata) =>
      if (name == 'handle')
        @handle = value
      else
        @error = RequestError "Tedious > Unexpected output parameter #{name} from sp_prepare"
    )

  transformIntoUnprepareRpc: (parameters) ->
    @parameters = []
    @addParameter('handle', TYPES.Int, @handle)

    @sqlTextOrProcedure = 'sp_unprepare'

  transformIntoExecuteRpc: (parameters) ->
    @parameters = []

    @addParameter('handle', TYPES.Int, @handle)

    for parameter in @originalParameters
      parameter.value = parameters[parameter.name]
      @parameters.push(parameter)
    
    if @validateParameters() then return

    @sqlTextOrProcedure = 'sp_execute'
  
  validateParameters: ->
    for parameter in @parameters
      value = parameter.type.validate parameter.value
      if value instanceof TypeError
        return @error = new RequestError "Validation failed for parameter '#{parameter.name}'. #{value.message}", "EPARAM"
      	
      parameter.value = value
    
    null

module.exports = Request
