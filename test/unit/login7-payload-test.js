var Login7Payload = require('../../src/login7-payload');

exports.create = function(test) {
  var loginData = {
    userName: 'user',
    password: 'pw',
    appName: 'app',
    serverName: 'server',
    language: 'lang',
    database: 'db',
    packetSize: 1024,
    tdsVersion: '7_2'
  };

  //start = new Date().getTime()
  //for c in [1..1000]
  //  payload = new Login7Payload(loginData)
  //end = new Date().getTime()
  //console.log(end - start)
  var payload = new Login7Payload(loginData);

  var expectedLength =
    4 + // Length
    32 + // Variable
    2 +
    2 +
    2 * payload.hostname.length +
    2 +
    2 +
    2 * loginData.userName.length +
    2 +
    2 +
    2 * loginData.password.length +
    2 +
    2 +
    2 * loginData.appName.length +
    2 +
    2 +
    2 * loginData.serverName.length +
    2 +
    2 +
    2 * 0 + // Reserved
    2 +
    2 +
    2 * payload.libraryName.length +
    2 +
    2 +
    2 * loginData.language.length +
    2 +
    2 +
    2 * loginData.database.length +
    payload.clientId.length +
    2 +
    2 +
    2 * payload.sspi.length +
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
  var passwordEnd = passwordStart + 2 * loginData.password.length;
  var passwordExpected = new Buffer([0xa2, 0xa5, 0xd2, 0xa5]);
  test.ok(data.slice(passwordStart, passwordEnd).equals(passwordExpected));

  //console.log(payload.toString(''))

  test.done();
};

exports.createSSPI = function(test) {
  var loginData = {
    userName: '',
    password: '',
    appName: 'app',
    serverName: 'server',
    domain: 'domain',
    workstation: 'workstation',
    language: 'lang',
    database: 'db',
    packetSize: 1024,
    tdsVersion: '7_2',
    sspiBlob: new Buffer([0xa0, 0xa1, 0xa2, 0xa5, 0xd2, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9])
  };

  var payload = new Login7Payload(loginData);

  var expectedLength =
    4 +                                             // Length
    32 +                                            // Variable
    2 + 2 + (2 * payload.hostname.length) +
    2 + 2 + (2 * loginData.userName.length) +
    2 + 2 + (2 * loginData.password.length) +
    2 + 2 + (2 * loginData.appName.length) +
    2 + 2 + (2 * loginData.serverName.length) +
    2 + 2 + (2 * 0) +                               // Reserved
    2 + 2 + (2 * payload.libraryName.length) +
    2 + 2 + (2 * loginData.language.length) +
    2 + 2 + (2 * loginData.database.length) +
    payload.clientId.length +
    2 + 2 + payload.sspi.length +             // NTLM
    2 + 2 + (2 * payload.attachDbFile.length) +
    2 + 2 + (2 * payload.changePassword.length) +
    4;                                              // cbSSPILong

  const data = payload.toBuffer();
  test.strictEqual(data.length, expectedLength);
  test.strictEqual(payload.sspi, loginData.sspiBlob);

  test.done();
};
