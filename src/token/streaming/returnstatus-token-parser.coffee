# s2.2.7.16

module.exports = ->
  @int32le "value"
  @tap ->
    @push
      name: 'RETURNSTATUS'
      event: 'returnStatus'
      value: @vars.value
