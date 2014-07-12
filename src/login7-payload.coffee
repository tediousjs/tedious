WritableTrackingBuffer = require('./tracking-buffer/writable-tracking-buffer')
require('./buffertools')
os= require('os')
sprintf = require('sprintf').sprintf
libraryName = require('./library').name
versions = require('./tds-versions').versions

FLAGS_1 =
  ENDIAN_LITTLE: 0x00,
  ENDIAN_BIG: 0x01,

  CHARSET_ASCII: 0x00,
  CHARSET_EBCDIC: 0x02,

  FLOAT_IEEE_754: 0x00,
  FLOAT_VAX: 0x04,
  FLOAT_ND5000: 0x08,

  BCP_DUMPLOAD_ON: 0x00,
  BCP_DUMPLOAD_OFF: 0x10,

  USE_DB_ON: 0x00,
  USE_DB_OFF: 0x20,

  INIT_DB_WARN: 0x00,
  INIT_DB_FATAL: 0x40,

  SET_LANG_WARN_OFF: 0x00,
  SET_LANG_WARN_ON: 0x80,

FLAGS_2 =
  INIT_LANG_WARN: 0x00,
  INIT_LANG_FATAL: 0x01,

  ODBC_OFF: 0x00,
  ODBC_ON: 0x02,

  F_TRAN_BOUNDARY: 0x04,          # Removed in TDS 7.2

  F_CACHE_CONNECT: 0x08,          # Removed in TDS 7.2

  USER_NORMAL: 0x00,
  USER_SERVER: 0x10,
  USER_REMUSER: 0x20,
  USER_SQLREPL: 0x40,

  INTEGRATED_SECURITY_OFF: 0x00,
  INTEGRATED_SECURITY_ON: 0x80

TYPE_FLAGS =
  SQL_DFLT: 0x00,
  SQL_TSQL: 0x01,

  OLEDB_OFF: 0x00,
  OLEDB_ON: 0x02,                 # Introduced in TDS 7.2

  READ_ONLY_INTENT: 0x04          # Introduced in TDS 7.4

FLAGS_3 =
  CHANGE_PASSWORD_NO: 0x00,
  CHANGE_PASSWORD_YES: 0x01,      # Introduced in TDS 7.2

  BINARY_XML: 0x02,               # Introduced in TDS 7.2

  SPAWN_USER_INSTANCE: 0x04,      # Introduced in TDS 7.2

  UNKNOWN_COLLATION_HANDLING: 0x08  # Introduced in TDS 7.3

NTLMFlags =
  NTLM_NegotiateUnicode: 0x00000001
  NTLM_NegotiateOEM: 0x00000002
  NTLM_RequestTarget: 0x00000004
  NTLM_Unknown9: 0x00000008
  NTLM_NegotiateSign: 0x00000010
  NTLM_NegotiateSeal: 0x00000020
  NTLM_NegotiateDatagram: 0x00000040
  NTLM_NegotiateLanManagerKey: 0x00000080
  NTLM_Unknown8: 0x00000100
  NTLM_NegotiateNTLM: 0x00000200
  NTLM_NegotiateNTOnly: 0x00000400
  NTLM_Anonymous: 0x00000800
  NTLM_NegotiateOemDomainSupplied: 0x00001000
  NTLM_NegotiateOemWorkstationSupplied: 0x00002000
  NTLM_Unknown6: 0x00004000
  NTLM_NegotiateAlwaysSign: 0x00008000
  NTLM_TargetTypeDomain: 0x00010000
  NTLM_TargetTypeServer: 0x00020000
  NTLM_TargetTypeShare: 0x00040000
  NTLM_NegotiateExtendedSecurity: 0x00080000 # Negotiate NTLM2 Key
  NTLM_NegotiateIdentify: 0x00100000 # Request Init Response
  NTLM_Unknown5: 0x00200000 # Request Accept Response
  NTLM_RequestNonNTSessionKey: 0x00400000
  NTLM_NegotiateTargetInfo: 0x00800000
  NTLM_Unknown4: 0x01000000
  NTLM_NegotiateVersion: 0x02000000
  NTLM_Unknown3: 0x04000000
  NTLM_Unknown2: 0x08000000
  NTLM_Unknown1: 0x10000000
  NTLM_Negotiate128: 0x20000000
  NTLM_NegotiateKeyExchange: 0x40000000
  NTLM_Negotiate56: 0x80000000

###
  s2.2.6.3
###
class Login7Payload
  constructor: (@loginData) ->
    lengthLength = 4

    fixed = @createFixedData()
    variable = @createVariableData(lengthLength + fixed.length)
    length = lengthLength + fixed.length + variable.length

    data = new WritableTrackingBuffer(300)
    data.writeUInt32LE(length)
    data.writeBuffer(fixed)
    data.writeBuffer(variable)

    @data = data.data

  createFixedData: ->
    @tdsVersion = versions[@loginData.tdsVersion]
    @packetSize = @loginData.packetSize
    @clientProgVer = 0
    @clientPid = process.pid
    @connectionId = 0
    @clientTimeZone = new Date().getTimezoneOffset()
    @clientLcid = 0x00000409                #Can't figure what form this should take.

    @flags1 =
      FLAGS_1.ENDIAN_LITTLE |
      FLAGS_1.CHARSET_ASCII |
      FLAGS_1.FLOAT_IEEE_754 |
      FLAGS_1.BCD_DUMPLOAD_OFF |
      FLAGS_1.USE_DB_OFF |
      FLAGS_1.INIT_DB_WARN |
      FLAGS_1.SET_LANG_WARN_ON

    @flags2 =
      FLAGS_2.INIT_LANG_WARN |
      FLAGS_2.ODBC_OFF |
      FLAGS_2.USER_NORMAL
    if @loginData.domain
      @flags2 |= FLAGS_2.INTEGRATED_SECURITY_ON
    else
      @flags2 |= FLAGS_2.INTEGRATED_SECURITY_OFF

    @flags3 =
      FLAGS_3.CHANGE_PASSWORD_NO |
      FLAGS_3.UNKNOWN_COLLATION_HANDLING

    @typeFlags =
      TYPE_FLAGS.SQL_DFLT |
      TYPE_FLAGS.OLEDB_OFF

    buffer = new WritableTrackingBuffer(100)
    buffer.writeUInt32LE(@tdsVersion)
    buffer.writeUInt32LE(@packetSize)
    buffer.writeUInt32LE(@clientProgVer)
    buffer.writeUInt32LE(@clientPid)
    buffer.writeUInt32LE(@connectionId)
    buffer.writeUInt8(@flags1)
    buffer.writeUInt8(@flags2)
    buffer.writeUInt8(@typeFlags)
    buffer.writeUInt8(@flags3)
    buffer.writeInt32LE(@clientTimeZone)
    buffer.writeUInt32LE(@clientLcid)

    buffer.data

  createVariableData: (offset) ->
    @variableLengthsLength = ((9 * 4) + 6 + (3 * 4) + 4)
    if @loginData.tdsVersion == '7_1'
      @variableLengthsLength = ((9 * 4) + 6 + (2 * 4))

    variableData =
      offsetsAndLengths: new WritableTrackingBuffer(200)
      data: new WritableTrackingBuffer(200, 'ucs2')
      offset: offset + @variableLengthsLength

    @hostname = os.hostname()

    @loginData = @loginData || {}
    @loginData.appName = @loginData.appName || 'Tedious'
    @libraryName = libraryName

    # Client ID, should be MAC address or other randomly generated GUID like value.
    @clientId = new Buffer([1, 2, 3, 4, 5, 6])
    unless @loginData.domain
      @sspi = ''
      @sspiLong = 0
    @attachDbFile = ''
    @changePassword = ''

    @addVariableDataString(variableData, @hostname)
    @addVariableDataString(variableData, @loginData.userName)
    @addVariableDataBuffer(variableData, @createPasswordBuffer())
    @addVariableDataString(variableData, @loginData.appName)
    @addVariableDataString(variableData, @loginData.serverName)
    @addVariableDataString(variableData, '')                        # Reserved for future use.
    @addVariableDataString(variableData, @libraryName)
    @addVariableDataString(variableData, @loginData.language)
    @addVariableDataString(variableData, @loginData.database)
    variableData.offsetsAndLengths.writeBuffer(@clientId)

    if @loginData.domain
      @ntlmPacket = @createNTLMRequest(@loginData)
      @sspiLong = @ntlmPacket.length
      variableData.offsetsAndLengths.writeUInt16LE(variableData.offset)
      variableData.offsetsAndLengths.writeUInt16LE(@ntlmPacket.length)
      variableData.data.writeBuffer(@ntlmPacket)
      variableData.offset += @ntlmPacket.length
    else
      @addVariableDataString(variableData, @sspi)
    @addVariableDataString(variableData, @attachDbFile)
    if @loginData.tdsVersion > '7_1'
      @addVariableDataString(variableData, @changePassword)           # Introduced in TDS 7.2
      variableData.offsetsAndLengths.writeUInt32LE(@sspiLong)         # Introduced in TDS 7.2

    variableData.offsetsAndLengths.data =
      Buffer.concat([variableData.offsetsAndLengths.data, variableData.data.data])

  addVariableDataBuffer: (variableData, buffer) ->
    variableData.offsetsAndLengths.writeUInt16LE(variableData.offset)
    variableData.offsetsAndLengths.writeUInt16LE(buffer.length / 2)

    variableData.data.writeBuffer(buffer)

    variableData.offset += buffer.length

  addVariableDataString: (variableData, value) ->
    value ||= ''
    variableData.offsetsAndLengths.writeUInt16LE(variableData.offset)
    variableData.offsetsAndLengths.writeUInt16LE(value.length)

    variableData.data.writeString(value);

    variableData.offset += value.length * 2

  createNTLMRequest: (options) ->
    domain = escape(options.domain.toUpperCase())
    protocol = "NTLMSSP\u0000"
    BODY_LENGTH = 40
    type1flags = @getNTLMFlags()
    bufferLength = BODY_LENGTH + domain.length
    buffer = new WritableTrackingBuffer(bufferLength)
    buffer.writeString(protocol, "utf8") # protocol
    buffer.writeUInt32LE(1) # type 1
    buffer.writeUInt32LE(type1flags) # TYPE1 flag
    buffer.writeUInt16LE(domain.length) # domain length
    buffer.writeUInt16LE(domain.length) # domain max length
    buffer.writeUInt32LE(BODY_LENGTH) # domain buffer offset
    buffer.writeUInt8(5) #ProductMajorVersion
    buffer.writeUInt8(0) #ProductMinorVersion
    buffer.writeUInt16LE(2195) #ProductBuild
    buffer.writeUInt8(0) #VersionReserved1
    buffer.writeUInt8(0) #VersionReserved2
    buffer.writeUInt8(0) #VersionReserved3
    buffer.writeUInt8(15) #NTLMRevisionCurrent
    buffer.writeString(domain, "ascii")
    buffer.data

  createPasswordBuffer: ->
    password = @loginData.password || ''
    password = new Buffer(password, 'ucs2')

    for b in [0..password.length - 1]
      byte = password[b]

      lowNibble = byte & 0x0f
      highNibble = (byte >> 4)
      byte = (lowNibble << 4) | highNibble

      byte = byte ^ 0xa5

      password[b] = byte

    password

  getNTLMFlags: ->
    (NTLMFlags.NTLM_NegotiateUnicode + 
    NTLMFlags.NTLM_NegotiateOEM + 
    NTLMFlags.NTLM_RequestTarget + 
    NTLMFlags.NTLM_NegotiateNTLM + 
    NTLMFlags.NTLM_NegotiateOemDomainSupplied + 
    NTLMFlags.NTLM_NegotiateAlwaysSign + 
    NTLMFlags.NTLM_NegotiateVersion + 
    NTLMFlags.NTLM_Negotiate128 + 
    NTLMFlags.NTLM_Negotiate56)

  toString: (indent) ->
    indent ||= ''

    indent + 'Login7 - ' +
      sprintf('TDS:0x%08X, PacketSize:0x%08X, ClientProgVer:0x%08X, ClientPID:0x%08X, ConnectionID:0x%08X',
          @tdsVersion,
          @packetSize,
          @clientProgVer,
          @clientPid,
          @connectionId
      ) + '\n' +
      indent + '         ' +
      sprintf('Flags1:0x%02X, Flags2:0x%02X, TypeFlags:0x%02X, Flags3:0x%02X, ClientTimezone:%d, ClientLCID:0x%08X',
          @flags1,
          @flags2,
          @typeFlags,
          @flags3,
          @clientTimeZone,
          @clientLcid
      ) + '\n' +
      indent + '         ' +
      sprintf("Hostname:'%s', Username:'%s', Password:'%s', AppName:'%s', ServerName:'%s', LibraryName:'%s'",
          @hostname,
          @loginData.userName,
          @loginData.password,
          @loginData.appName,
          @loginData.serverName,
          libraryName
      ) + '\n' +
      indent + '         ' +
      sprintf("Language:'%s', Database:'%s', SSPI:'%s', AttachDbFile:'%s', ChangePassword:'%s'",
          @loginData.language,
          @loginData.database,
          @sspi,
          @attachDbFile
          @changePassword
      )

module.exports = Login7Payload
