var Login7Payload = require('../../src/login7-payload');

exports.create = function(test) {
  var payload = new Login7Payload({
    tdsVersion: 0x72090002,
    packetSize: 1024,
    clientProgVer: 0,
    clientPid: 12345,
    connectionId: 0,
    clientTimeZone: 120,
    clientLcid: 0x00000409
  });

  payload.hostname = 'example.com';
  payload.userName = 'user';
  payload.password = 'pw';
  payload.appName = 'app';
  payload.serverName = 'server';
  payload.language = 'lang';
  payload.database = 'db';
  payload.libraryName = 'Tedious';
  payload.attachDbFile = 'c:\\mydbfile.mdf';
  payload.changePassword = 'new_pw';

  var expectedLength =
    4 + // Length
    32 + // Variable
    2 +
    2 +
    2 * payload.hostname.length +
    2 +
    2 +
    2 * payload.userName.length +
    2 +
    2 +
    2 * payload.password.length +
    2 +
    2 +
    2 * payload.appName.length +
    2 +
    2 +
    2 * payload.serverName.length +
    2 +
    2 +
    2 * 0 + // Reserved
    2 +
    2 +
    2 * payload.libraryName.length +
    2 +
    2 +
    2 * payload.language.length +
    2 +
    2 +
    2 * payload.database.length +
    6 + // ClientID
    2 +
    2 +
    2 * 0 + // No SSPI given
    2 +
    2 +
    2 * payload.attachDbFile.length +
    2 +
    2 +
    2 * payload.changePassword.length +
    4; // cbSSPILong

  const data = payload.toBuffer();
  test.strictEqual(data.length, expectedLength);

  var passwordStart = data.readUInt16LE(4 + 32 + 2 * 4);
  var passwordEnd = passwordStart + 2 * payload.password.length;
  var passwordExpected = new Buffer([0xa2, 0xa5, 0xd2, 0xa5]);
  test.ok(data.slice(passwordStart, passwordEnd).equals(passwordExpected));

  test.done();
};

exports.createSSPI = function(test) {
  var payload = new Login7Payload({
    tdsVersion: 0x72090002,
    packetSize: 1024,
    clientProgVer: 0,
    clientPid: 12345,
    connectionId: 0,
    clientTimeZone: 120,
    clientLcid: 0x00000409
  });

  payload.hostname = 'example.com';
  payload.appName = 'app';
  payload.serverName = 'server';
  payload.language = 'lang';
  payload.database = 'db';
  payload.libraryName = 'Tedious';
  payload.attachDbFile = 'c:\\mydbfile.mdf';
  payload.changePassword = 'new_pw';
  payload.sspi = new Buffer([0xa0, 0xa1, 0xa2, 0xa5, 0xd2, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9]);

  var expectedLength =
    4 +                                             // Length
    32 +                                            // Variable
    2 + 2 + (2 * payload.hostname.length) +
    2 + 2 + (2 * 0) +
    2 + 2 + (2 * 0) +
    2 + 2 + (2 * payload.appName.length) +
    2 + 2 + (2 * payload.serverName.length) +
    2 + 2 + (2 * 0) +                               // Reserved
    2 + 2 + (2 * payload.libraryName.length) +
    2 + 2 + (2 * payload.language.length) +
    2 + 2 + (2 * payload.database.length) +
    6 +
    2 + 2 + payload.sspi.length +             // NTLM
    2 + 2 + (2 * payload.attachDbFile.length) +
    2 + 2 + (2 * payload.changePassword.length) +
    4;                                              // cbSSPILong

  const data = payload.toBuffer();
  test.strictEqual(data.length, expectedLength);

  test.done();
};
