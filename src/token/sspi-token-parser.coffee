parseChallenge = (parser) ->
  challenge = {}
  yield parser.readBuffer(2) # the token buffer starts w/ junk, this skips it
  challenge.magic = yield parser.readString(8)
  challenge.type = yield parser.readInt32LE()
  challenge.domainLen = yield parser.readInt16LE()
  challenge.domainMax = yield parser.readInt16LE()
  challenge.domainOffset = yield parser.readInt32LE()
  challenge.flags = yield parser.readInt32LE()
  challenge.nonce = yield parser.readBuffer(8)
  challenge.zeroes = yield parser.readBuffer(8)
  challenge.targetLen = yield parser.readInt16LE()
  challenge.targetMax = yield parser.readInt16LE()
  challenge.targetOffset = yield parser.readInt32LE()
  challenge.oddData = yield parser.readBuffer(8)
  challenge.domain = (yield parser.readBuffer(challenge.domainLen)).toString('ucs2')
  challenge.target = yield parser.readBuffer(challenge.targetLen)
  challenge

module.exports = (parser) ->
  challenge =  yield from parseChallenge(parser)
  name: 'SSPICHALLENGE'
  event: 'sspichallenge'
  ntlmpacket: challenge
