module.exports = ->
  @buffer "junk", 3
  @tap "challenge", ->
    @string "magic", 8
    @int32le "type"
    @int16le "domainLen"
    @int16le "domainMax"
    @ing32le "domainOffset"
    @int32le "flags"
    @buffer "nonce", 8
    @buffer "zeroes", 8
    @int16le "targetLen"
    @int16le "targetMax"
    @int32le "targetOffset"
    @buffer "oddData", 8
    @buffer "domain", "domainLen"
    @buffer "target", "targetLen"
  @tap ->
    @vars.challenge.domain = @vars.challenge.domain.toString('ucs2')

    @push
      name: 'SSPICHALLENGE'
      event: 'sspichallenge'
      ntlmpacket: @vars.challenge