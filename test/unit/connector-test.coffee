Connector = require('../../src/connector')
Dns = require('dns')
Sinon = require('sinon')

invalidIpv4Address1 = { address: '240.1.2.3', family: 4 }
invalidIpv4Address2 = { address: '240.1.2.4', family: 4 }
invalidIpv6Address1 = { address: '2002:20:0:0:0:0:1:2', family: 6 }
invalidIpv6Address2 = { address: '2002:20:0:0:0:0:1:3', family: 6 }

microsoftIpv4AddressRaw = '23.96.52.53'
bingIpv4AddressRaw = '204.79.197.200'
googleIpv6AdddressRaw = '2607:f8b0:400a:806::200e'
akamaiIpv6AddressRaw = '2600:1406:1a:388::22df'

validIpv4Address1 = { address: microsoftIpv4AddressRaw, family: 4 }
validIpv4Address2 = { address: microsoftIpv4AddressRaw, family: 4 }
validIpv6Address1 = { address: microsoftIpv4AddressRaw, family: 6 }
validIpv6Address2 = { address: microsoftIpv4AddressRaw, family: 6 }

isDnsLookupCalled = false

successCase = true
multiSubnetFailoverEnabled = true

stubDns = (addresses) ->
  restoreDns()
  stub = Sinon.stub(Dns, 'lookup', (domain, options, callback) ->
    if (isDnsLookupCalled)
      throw ('Dns lookup called a second time')

    isDnsLookupCalled = true
    callback(null, addresses)
  )

restoreDns = () ->
 if (Dns.lookup.restore != undefined)
   Dns.lookup.restore()

testImpl = (addresses, isMultiSubnetFailoverEnabled, isSuccessCase, test) ->
  domainName1 = 'anyDomain'
  port1 = '80'
  isDnsLookupCalled = false
  stubDns(addresses)
  connector = new Connector.Connector(
    {host: domainName1, port: port1 }, isMultiSubnetFailoverEnabled)
  connector.execute((err, socket) ->
    restoreDns()
    if (isSuccessCase)
      test.ok(err == null)
      socket.destroy()
    else
      test.ok(err != null && err.message.length != 0)
    test.done()
  )

### Success test cases begin. ###

exports.singleGoodIpv4NoMultiSuccess = (test) ->
  addresses = [
    validIpv4Address1
  ]
  testImpl(addresses, !multiSubnetFailoverEnabled, successCase, test)

exports.singleGoodIpv6NoMultiSuccess = (test) ->
  addresses = [
    validIpv6Address1
  ]
  testImpl(addresses, !multiSubnetFailoverEnabled, successCase, test)

exports.multipleGoodIpv4NoMultiSuccess = (test) ->
  addresses = [
    validIpv4Address1,
    validIpv4Address2
  ]
  testImpl(addresses, !multiSubnetFailoverEnabled, successCase, test)

exports.multipleGoodIpv6NoMultiSuccess = (test) ->
  addresses = [
    validIpv6Address1,
    validIpv6Address2
  ]
  testImpl(addresses, !multiSubnetFailoverEnabled, successCase, test)

exports.multipleGoodIpv4v6NoMultiSuccess = (test) ->
  addresses = [
    validIpv4Address1,
    validIpv4Address2,
    validIpv6Address1,
    validIpv6Address2
  ]
  testImpl(addresses, !multiSubnetFailoverEnabled, successCase, test)

exports.singleGoodIpv4MultiSuccess = (test) ->
  addresses = [
    validIpv4Address1
  ]
  testImpl(addresses, multiSubnetFailoverEnabled, successCase, test)

exports.singleGoodIpv6MultiSuccess = (test) ->
  addresses = [
    validIpv6Address1
  ]
  testImpl(addresses, multiSubnetFailoverEnabled, successCase, test)

exports.multipleGoodIpv4MultiSuccess = (test) ->
  addresses = [
    validIpv4Address1,
    validIpv4Address2
  ]
  testImpl(addresses, multiSubnetFailoverEnabled, successCase, test)

exports.multipleGoodIpv6MultiSuccess = (test) ->
  addresses = [
    validIpv6Address1,
    validIpv6Address2
  ]
  testImpl(addresses, multiSubnetFailoverEnabled, successCase, test)

exports.multipleGoodIpv4v6MultiSuccess = (test) ->
  addresses = [
    validIpv4Address1,
    validIpv4Address2,
    validIpv6Address1,
    validIpv6Address2
  ]
  testImpl(addresses, multiSubnetFailoverEnabled, successCase, test)

### Sucess test cases end. ###

### Failure test cases begin. ###

exports.singleBadIpv4NoMultiFailure = (test) ->
  addresses = [
    invalidIpv4Address1
  ]
  testImpl(addresses, !multiSubnetFailoverEnabled, !successCase, test)

exports.singleBadIpv6NoMultiFailure = (test) ->
  addresses = [
    invalidIpv6Address1
  ]
  testImpl(addresses, !multiSubnetFailoverEnabled, !successCase, test)

exports.multipleBadIpv4NoMultiFailure = (test) ->
  addresses = [
    invalidIpv4Address1,
    invalidIpv4Address2
  ]
  testImpl(addresses, !multiSubnetFailoverEnabled, !successCase, test)

exports.multipleBadIpv6NoMultiFailure = (test) ->
  addresses = [
    invalidIpv6Address1,
    invalidIpv6Address2
  ]
  testImpl(addresses, !multiSubnetFailoverEnabled, !successCase, test)

exports.multipleBadIpv4v6NoMultiFailure = (test) ->
  addresses = [
    invalidIpv4Address1,
    invalidIpv4Address2,
    invalidIpv6Address1,
    invalidIpv6Address2
  ]
  testImpl(addresses, !multiSubnetFailoverEnabled, !successCase, test)

exports.singleBadIpv4MultiFailure = (test) ->
  addresses = [
    invalidIpv4Address1
  ]
  testImpl(addresses, multiSubnetFailoverEnabled, !successCase, test)

exports.singleBadIpv6MultiFailure = (test) ->
  addresses = [
    invalidIpv6Address1
  ]
  testImpl(addresses, multiSubnetFailoverEnabled, !successCase, test)

exports.multipleBadIpv4MultiFailure = (test) ->
  addresses = [
    invalidIpv4Address1,
    invalidIpv4Address2
  ]
  testImpl(addresses, multiSubnetFailoverEnabled, !successCase, test)

exports.multipleBadIpv6MultiFailure = (test) ->
  addresses = [
    invalidIpv6Address1,
    invalidIpv6Address2
  ]
  testImpl(addresses, multiSubnetFailoverEnabled, !successCase, test)

exports.multipleBadIpv4v6MultiFailure = (test) ->
  addresses = [
    invalidIpv4Address1,
    invalidIpv4Address2,
    invalidIpv6Address1,
    invalidIpv6Address2
  ]
  testImpl(addresses, multiSubnetFailoverEnabled, !successCase, test)

###Failure test cases end. ###
