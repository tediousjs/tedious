'use strict';

var Login7Payload;

require('../../src/buffertools');

Login7Payload = require('../../src/login7-payload');

exports.create = function(test) {
  var expectedLength, loginData, passwordEnd, passwordExpected, passwordStart, payload;
  loginData = {
    userName: 'user',
    password: 'pw',
    appName: 'app',
    serverName: 'server',
    language: 'lang',
    database: 'db',
    packetSize: 1024,
    tdsVersion: '7_2'
  };
  payload = new Login7Payload(loginData);
  expectedLength = 4 + 32 + 2 + 2 + (2 * payload.hostname.length) + 2 + 2 + (2 * loginData.userName.length) + 2 + 2 + (2 * loginData.password.length) + 2 + 2 + (2 * loginData.appName.length) + 2 + 2 + (2 * loginData.serverName.length) + 2 + 2 + (2 * 0) + 2 + 2 + (2 * payload.libraryName.length) + 2 + 2 + (2 * loginData.language.length) + 2 + 2 + (2 * loginData.database.length) + payload.clientId.length + 2 + 2 + (2 * payload.sspi.length) + 2 + 2 + (2 * payload.attachDbFile.length) + 2 + 2 + (2 * payload.changePassword.length) + 4;
  test.strictEqual(payload.data.length, expectedLength);
  passwordStart = payload.data.readUInt16LE(4 + 32 + (2 * 4));
  passwordEnd = passwordStart + (2 * loginData.password.length);
  passwordExpected = new Buffer([0xa2, 0xa5, 0xd2, 0xa5]);
  test.ok(payload.data.slice(passwordStart, passwordEnd).equals(passwordExpected));
  return test.done();
};

exports.createNTLM = function(test) {
  var domainName, expectedLength, loginData, passwordEnd, passwordExpected, passwordStart, payload, protocolHeader, workstationName;
  loginData = {
    userName: 'user',
    password: 'pw',
    appName: 'app',
    serverName: 'server',
    domain: 'domain',
    workstation: 'workstation',
    language: 'lang',
    database: 'db',
    packetSize: 1024,
    tdsVersion: '7_2'
  };
  payload = new Login7Payload(loginData);
  expectedLength = 4 + 32 + 2 + 2 + (2 * payload.hostname.length) + 2 + 2 + (2 * loginData.userName.length) + 2 + 2 + (2 * loginData.password.length) + 2 + 2 + (2 * loginData.appName.length) + 2 + 2 + (2 * loginData.serverName.length) + 2 + 2 + (2 * 0) + 2 + 2 + (2 * payload.libraryName.length) + 2 + 2 + (2 * loginData.language.length) + 2 + 2 + (2 * loginData.database.length) + payload.clientId.length + 2 + 2 + payload.ntlmPacket.length + 2 + 2 + (2 * payload.attachDbFile.length) + 2 + 2 + (2 * payload.changePassword.length) + 4;
  test.strictEqual(payload.data.length, expectedLength);
  protocolHeader = payload.ntlmPacket.slice(0, 8).toString('utf8');
  test.strictEqual(protocolHeader, 'NTLMSSP\u0000');
  workstationName = payload.ntlmPacket.slice(payload.ntlmPacket.length - 17).toString('ascii').substr(0, 11);
  test.strictEqual(workstationName, 'WORKSTATION');
  domainName = payload.ntlmPacket.slice(payload.ntlmPacket.length - 6).toString('ascii');
  test.strictEqual(domainName, 'DOMAIN');
  passwordStart = payload.data.readUInt16LE(4 + 32 + (2 * 4));
  passwordEnd = passwordStart + (2 * loginData.password.length);
  passwordExpected = new Buffer([0xa2, 0xa5, 0xd2, 0xa5]);
  test.ok(payload.data.slice(passwordStart, passwordEnd).equals(passwordExpected));
  return test.done();
};
