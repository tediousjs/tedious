BigInteger = require('big-number').n
crypto = require('crypto')
hex = [ '0','1','2','3','4','5','6','7', '8', '9', 'a','b','c','d','e','f' ]
WritableTrackingBuffer = require('./tracking-buffer/writable-tracking-buffer')
class NTLMResponsePayload
  constructor: (loginData) ->
    @data = @createResponse(loginData)
    return
  NTLMResponsePayload::toString = (indent) ->
    indent or (indent = '')
    indent + 'NTLM Auth'

  NTLMResponsePayload::createResponse = (challenge) ->
    client_nonce = @createClientNonce()
    lmv2len = 24
    ntlmv2len = 16
    domain = challenge.domain
    username = challenge.userName
    password = challenge.password
    ntlmData = challenge.ntlmpacket
    server_data = ntlmData.target
    server_nonce = ntlmData.nonce
    bufferLength = 64 + (domain.length * 2) + (username.length * 2) + lmv2len + ntlmv2len + 8 + 8 + 8 + 4 + server_data.length + 4 # empty
    data = new WritableTrackingBuffer(bufferLength)
    data.position = 0
    data.writeString('NTLMSSP\u0000', 'utf8')
    data.writeUInt32LE(0x03)
    baseIdx = 64
    dnIdx = baseIdx
    unIdx = dnIdx + domain.length * 2
    l2Idx = unIdx + username.length * 2
    ntIdx = l2Idx + lmv2len
    data.writeUInt16LE(lmv2len)
    data.writeUInt16LE(lmv2len)
    data.writeUInt32LE(l2Idx)
    data.writeUInt16LE(ntlmv2len)
    data.writeUInt16LE(ntlmv2len)
    data.writeUInt32LE(ntIdx)
    data.writeUInt16LE(domain.length * 2)
    data.writeUInt16LE(domain.length * 2)
    data.writeUInt32LE(dnIdx)
    data.writeUInt16LE(username.length * 2)
    data.writeUInt16LE(username.length * 2)
    data.writeUInt32LE(unIdx)
    data.writeUInt16LE(0)
    data.writeUInt16LE(0)
    data.writeUInt32LE(baseIdx)
    data.writeUInt16LE(0)
    data.writeUInt16LE(0)
    data.writeUInt32LE(baseIdx)
    data.writeUInt16LE(0x8201)
    data.writeUInt16LE(0x08)
    data.writeString(domain, 'ucs2')
    data.writeString(username, 'ucs2')
    lmv2Data = @lmv2Response(domain, username, password, server_nonce, client_nonce)
    data.copyFrom(lmv2Data)
    genTime = (new Date).getTime()
    ntlmData = @ntlmv2Response(domain, username, password, server_nonce, server_data, client_nonce, genTime)
    data.copyFrom(ntlmData)
    data.writeUInt32LE(0x0101)
    data.writeUInt32LE(0x0000)
    timestamp = @createTimestamp(genTime)
    data.copyFrom(timestamp)
    data.copyFrom(client_nonce)
    data.writeUInt32LE(0x0000)
    data.copyFrom(server_data)
    data.writeUInt32LE(0x0000)
    data.data

  NTLMResponsePayload::createClientNonce = ->
    client_nonce = new Buffer(8)
    nidx = 0
    while nidx < 8
      client_nonce.writeUInt8(Math.ceil(Math.random() * 255), nidx)
      nidx++
    client_nonce

  NTLMResponsePayload::ntlmv2Response = (domain, user, password, serverNonce, targetInfo, clientNonce, mytime) ->
    timestamp = @createTimestamp(mytime)
    hash = @ntv2Hash(domain, user, password)
    dataLength = 40 + targetInfo.length
    data = new Buffer(dataLength)
    serverNonce.copy(data, 0, 0, 8)
    data.writeUInt32LE(0x101, 8)
    data.writeUInt32LE(0x0, 12)
    timestamp.copy(data, 16, 0, 8)
    clientNonce.copy(data, 24, 0, 8)
    data.writeUInt32LE(0x0, 32)
    targetInfo.copy(data, 36, 0, targetInfo.length)
    data.writeUInt32LE(0x0, 36 + targetInfo.length)
    @hmacMD5(data, hash)

  NTLMResponsePayload::createTimestamp = (time) ->
    tenthsOfAMicrosecond = new BigInteger( time ).plus( 11644473600 ).multiply( 10000000 )
    hexArray = [];
    pair = [];
    while tenthsOfAMicrosecond.val() != '0'
      idx = tenthsOfAMicrosecond.mod(16)
      pair.unshift(hex[idx]);
      if pair.length == 2
        hexArray.push(pair.join(''))
        pair = [];
    
    if pair.length > 0
      hexArray.push(pair[ 0 ] + '0')
    
    return new Buffer( hexArray.join(''), 'hex' )

  NTLMResponsePayload::lmv2Response = (domain, user, password, serverNonce, clientNonce) ->
    hash = @ntv2Hash(domain, user, password)
    data = new Buffer(serverNonce.length + clientNonce.length)
    serverNonce.copy(data)
    clientNonce.copy(data, serverNonce.length, 0, clientNonce.length)
    newhash = @hmacMD5(data, hash)
    response = new Buffer(newhash.length + clientNonce.length)
    newhash.copy(response)
    clientNonce.copy(response, newhash.length, 0, clientNonce.length)
    response

  NTLMResponsePayload::ntv2Hash = (domain, user, password) ->
    hash = @ntHash(password)
    identity = new Buffer(user.toUpperCase() + domain.toUpperCase(), 'ucs2')
    @hmacMD5(identity, hash)

  NTLMResponsePayload::ntHash = (text) ->
    hash = new Buffer(21)
    hash.fill(0)
    unicodeString = new Buffer(text, 'ucs2')
    md4 = crypto.createHash('md4').update(unicodeString).digest()
    if md4.copy then md4.copy(hash) else new Buffer(md4, 'ascii').copy(hash)
    hash

  NTLMResponsePayload::hmacMD5 = (data, key) ->
    hmac = crypto.createHmac('MD5', key)
    hmac.update(data)
    result = hmac.digest()
    if result.copy then result else new Buffer(result, 'ascii').slice(0,16)

module.exports = NTLMResponsePayload