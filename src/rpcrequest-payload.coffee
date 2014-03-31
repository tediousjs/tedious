WritableTrackingBuffer = require('./tracking-buffer/tracking-buffer').WritableTrackingBuffer
writeAllHeaders = require('./all-headers').writeToTrackingBuffer
typeByName = require('./data-type').typeByName

# OptionFlags
OPTION =
  WITH_RECOMPILE: 0x01
  NO_METADATA: 0x02
  REUSE_METADATA: 0x04

# StatusFlags
STATUS =
  BY_REF_VALUE: 0x01        # Output parameter
  DEFAULT_VALUE: 0x02

###
  s2.2.6.5
###
class RpcRequestPayload
  constructor: (@request, txnDescriptor, options) ->
    buffer = new WritableTrackingBuffer(500)

    @procedure = @request.sqlTextOrProcedure
    
    if options.tdsVersion >= '7_2'
      outstandingRequestCount = 1
      writeAllHeaders(buffer, txnDescriptor, outstandingRequestCount)

    # NameLenProcID
    if typeof @procedure == 'string'
      buffer.writeUsVarchar(@procedure)   # ProcName
    else
      buffer.writeUShort(0xFFFF)          # ProcIDSwitch
      buffer.writeUShort(@procedure)      # ProcID

    # OptionFlags
    optionFlags = 0
    buffer.writeUInt16LE(optionFlags)

    # *ParameterData
    for parameter in @request.parameters
      statusFlags = 0
      if parameter.output
        statusFlags |= STATUS.BY_REF_VALUE

      # ParamMetaData (less TYPE_INFO)
      buffer.writeBVarchar('@' + parameter.name)
      buffer.writeUInt8(statusFlags)
      
      param =
        value: parameter.value
      
      if (parameter.type.id & 0x30) == 0x20 # Variable length
        param.length = parameter.length ? parameter.type.resolveLength? parameter
      
      if parameter.type.hasScale
        param.scale = parameter.scale ? parameter.type.resolveScale? parameter
      
      if parameter.type.hasPrecision
        param.precision = parameter.precision ? parameter.type.resolvePrecision? parameter

      parameter.type.writeTypeInfo(buffer, param, options)
      parameter.type.writeParameterData(buffer, param, options)

    @data = buffer.data

  toString: (indent) ->
    indent ||= ''
    indent + "RPC Request - #{@procedure}"

module.exports = RpcRequestPayload
