'use strict';

const Connector = require('../../src/connector');
const Dns = require('dns');
const Sinon = require('sinon');

const invalidIpv4Address1 = { address: '240.1.2.3', family: 4 };
const invalidIpv4Address2 = { address: '240.1.2.4', family: 4 };
const invalidIpv6Address1 = { address: '2002:20:0:0:0:0:1:2', family: 6 };
const invalidIpv6Address2 = { address: '2002:20:0:0:0:0:1:3', family: 6 };

const microsoftIpv4AddressRaw = '23.96.52.53';
const bingIpv4AddressRaw = '204.79.197.200';
const googleIpv6AdddressRaw = '2607:f8b0:400a:806::200e';
const akamaiIpv6AddressRaw = '2600:1406:1a:388::22df';

const validIpv4Address1 = { address: microsoftIpv4AddressRaw, family: 4 };
const validIpv4Address2 = { address: bingIpv4AddressRaw, family: 4 };
const validIpv6Address1 = { address: googleIpv6AdddressRaw, family: 6 };
const validIpv6Address2 = { address: akamaiIpv6AddressRaw, family: 6 };

let isDnsLookupCalled = false;

const successCase = true;
const multiSubnetFailoverEnabled = true;

function stubDns(addresses) {
  restoreDns();
  Sinon.stub(Dns, 'lookup', function(domain, options, callback) {
    if (isDnsLookupCalled)
      throw ('Dns lookup called a second time');

    isDnsLookupCalled = true;
    callback(null, addresses);
  });
}

function restoreDns() {
  if (Dns.lookup.restore !== undefined)
    Dns.lookup.restore();
}

function testImpl(addresses, isMultiSubnetFailoverEnabled, isSuccessCase, test) {
  const domainName1 = 'anyDomain';
  const port1 = '80';
  isDnsLookupCalled = false;
  stubDns(addresses);
  const connector = new Connector.Connector(
    {host: domainName1, port: port1 }, isMultiSubnetFailoverEnabled);
  connector.execute(function(err, socket) {
    restoreDns();
    if (isSuccessCase) {
      test.ok(err === null);
      socket.destroy();
    } else {
      test.ok(err !== null && err.message.length !== 0);
    }
    test.done();
  });
}


////////// Success test cases begin. //////////

exports.singleGoodIpv4NoMultiSuccess = function(test) {
  const addresses = [
    validIpv4Address1
  ];
  testImpl(addresses, !multiSubnetFailoverEnabled, successCase, test);
};

exports.singleGoodIpv6NoMultiSuccess = function(test) {
  const addresses = [
    validIpv6Address1
  ];
  testImpl(addresses, !multiSubnetFailoverEnabled, successCase, test);
};

exports.multipleGoodIpv4NoMultiSuccess = function(test) {
  const addresses = [
    validIpv4Address1,
    validIpv4Address2
  ];
  testImpl(addresses, !multiSubnetFailoverEnabled, successCase, test);
};

exports.multipleGoodIpv6NoMultiSuccess = function(test) {
  const addresses = [
    validIpv6Address1,
    validIpv6Address2
  ];
  testImpl(addresses, !multiSubnetFailoverEnabled, successCase, test);
};

exports.multipleGoodIpv4v6NoMultiSuccess = function(test) {
  const addresses = [
    validIpv4Address1,
    validIpv4Address2,
    validIpv6Address1,
    validIpv6Address2
  ];
  testImpl(addresses, !multiSubnetFailoverEnabled, successCase, test);
};

exports.singleGoodIpv4MultiSuccess = function(test) {
  const addresses = [
    validIpv4Address1
  ];
  testImpl(addresses, multiSubnetFailoverEnabled, successCase, test);
};

exports.singleGoodIpv6MultiSuccess = function(test) {
  const addresses = [
    validIpv6Address1
  ];
  testImpl(addresses, multiSubnetFailoverEnabled, successCase, test);
};

exports.multipleGoodIpv4MultiSuccess = function(test) {
  const addresses = [
    validIpv4Address1,
    validIpv4Address2
  ];
  testImpl(addresses, multiSubnetFailoverEnabled, successCase, test);
};

exports.multipleGoodIpv6MultiSuccess = function(test) {
  const addresses = [
    validIpv6Address1,
    validIpv6Address2
  ];
  testImpl(addresses, multiSubnetFailoverEnabled, successCase, test);
};

exports.multipleGoodIpv4v6MultiSuccess = function(test) {
  const addresses = [
    validIpv4Address1,
    validIpv4Address2,
    validIpv6Address1,
    validIpv6Address2
  ];
  testImpl(addresses, multiSubnetFailoverEnabled, successCase, test);
};

////////// Failure test cases begin. //////////

exports.singleBadIpv4NoMultiFailure = function(test) {
  const addresses = [
    invalidIpv4Address1
  ];
  testImpl(addresses, !multiSubnetFailoverEnabled, !successCase, test);
};

exports.singleBadIpv6NoMultiFailure = function(test) {
  const addresses = [
    invalidIpv6Address1
  ];
  testImpl(addresses, !multiSubnetFailoverEnabled, !successCase, test);
};

exports.multipleBadIpv4NoMultiFailure = function(test) {
  const addresses = [
    invalidIpv4Address1,
    invalidIpv4Address2
  ];
  testImpl(addresses, !multiSubnetFailoverEnabled, !successCase, test);
};

exports.multipleBadIpv6NoMultiFailure = function(test) {
  const addresses = [
    invalidIpv6Address1,
    invalidIpv6Address2
  ];
  testImpl(addresses, !multiSubnetFailoverEnabled, !successCase, test);
};

exports.multipleBadIpv4v6NoMultiFailure = function(test) {
  const addresses = [
    invalidIpv4Address1,
    invalidIpv4Address2,
    invalidIpv6Address1,
    invalidIpv6Address2
  ];
  testImpl(addresses, !multiSubnetFailoverEnabled, !successCase, test);
};

exports.singleBadIpv4MultiFailure = function(test) {
  const addresses = [
    invalidIpv4Address1
  ];
  testImpl(addresses, multiSubnetFailoverEnabled, !successCase, test);
};

exports.singleBadIpv6MultiFailure = function(test) {
  const addresses = [
    invalidIpv6Address1
  ];
  testImpl(addresses, multiSubnetFailoverEnabled, !successCase, test);
};

exports.multipleBadIpv4MultiFailure = function(test) {
  const addresses = [
    invalidIpv4Address1,
    invalidIpv4Address2
  ];
  testImpl(addresses, multiSubnetFailoverEnabled, !successCase, test);
};

exports.multipleBadIpv6MultiFailure = function(test) {
  const addresses = [
    invalidIpv6Address1,
    invalidIpv6Address2
  ];
  testImpl(addresses, multiSubnetFailoverEnabled, !successCase, test);
};

exports.multipleBadIpv4v6MultiFailure = function(test) {
  const addresses = [
    invalidIpv4Address1,
    invalidIpv4Address2,
    invalidIpv6Address1,
    invalidIpv6Address2
  ];
  testImpl(addresses, multiSubnetFailoverEnabled, !successCase, test);
};
