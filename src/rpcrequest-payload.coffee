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
  constructor: (@request, txnDescriptor) ->
    buffer = new WritableTrackingBuffer(500)

    @procedure = @request.sqlTextOrProcedure

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

      parameter.type.writeParameterData(buffer, parameter)

    @data = buffer.data

  toString: (indent) ->
    indent ||= ''
    indent + "RPC Request - #{@procedure}"

module.exports = RpcRequestPayload
