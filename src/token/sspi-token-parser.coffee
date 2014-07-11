parseChallenge = (buffer) ->
  challenge = {}
  buffer.position = 3 # the token buffer starts w/ junk, this skips it
  challenge.magic = buffer.readString(8, "ascii")
  challenge.type = buffer.readInt32LE()
  challenge.domainLen = buffer.readInt16LE()
  challenge.domainMax = buffer.readInt16LE()
  challenge.domainOffset = buffer.readInt32LE()
  challenge.flags = buffer.readInt32LE()
  challenge.nonce = buffer.readBuffer(8)
  challenge.zeroes = buffer.readBuffer(8)
  challenge.targetLen = buffer.readInt16LE()
  challenge.targetMax = buffer.readInt16LE()
  challenge.targetOffset = buffer.readInt32LE()
  challenge.oddData = buffer.readBuffer(8)
  challenge.domain = buffer.readString(challenge.domainLen, "ucs2")
  challenge.target = buffer.readBuffer(challenge.targetLen)
  challenge
parser = (buffer) ->
  challenge = parseChallenge(buffer)
  name: "SSPICHALLENGE"
  event: "sspichallenge"
  ntlmpacket: challenge

module.exports = parser