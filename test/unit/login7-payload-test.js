const { assert } = require('chai');
const Login7Payload = require('../../src/login7-payload');

describe('Login7Payload', function() {
  describe('#toBuffer', function() {

    describe('for a login payload with a password', function() {
      it('generates the expected data', function() {
        const payload = new Login7Payload({
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

        const data = payload.toBuffer();

        const expectedLength =
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
          4 + // cbSSPILong
          5; // FeatureExt

        assert.lengthOf(data, expectedLength);

        const passwordStart = data.readUInt16LE(4 + 32 + 2 * 4);
        const passwordEnd = passwordStart + 2 * payload.password.length;
        const passwordExpected = Buffer.from([0xa2, 0xa5, 0xd2, 0xa5]);

        assert.deepEqual(data.slice(passwordStart, passwordEnd), passwordExpected);
      });
    });

    describe('for a login payload with SSPI data', function() {
      it('generates the expected data', function() {
        const payload = new Login7Payload({
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
        payload.sspi = Buffer.from([0xa0, 0xa1, 0xa2, 0xa5, 0xd2, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9]);

        const data = payload.toBuffer();

        var expectedLength =
          4 + // Length
          32 + // Variable
          2 + 2 + (2 * payload.hostname.length) +
          2 + 2 + (2 * 0) +
          2 + 2 + (2 * 0) +
          2 + 2 + (2 * payload.appName.length) +
          2 + 2 + (2 * payload.serverName.length) +
          2 + 2 + (2 * 0) + // Reserved
          2 + 2 + (2 * payload.libraryName.length) +
          2 + 2 + (2 * payload.language.length) +
          2 + 2 + (2 * payload.database.length) +
          6 +
          2 + 2 + payload.sspi.length + // NTLM
          2 + 2 + (2 * payload.attachDbFile.length) +
          2 + 2 + (2 * payload.changePassword.length) +
          4 + // cbSSPILong
          5; // FeatureExt

        assert.lengthOf(data, expectedLength);
      });
    });

    describe('for a login payload with active directory authentication', function() {
      it('generates the expected data', function() {
        const payload = new Login7Payload({
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
        payload.fedAuth = {
          type: 'ADAL',
          echo: true,
          workflow: 'default'
        };

        const data = payload.toBuffer();

        var expectedLength =
          4 + // Length
          32 + // Fixed data
          // Variable
          2 + 2 + (2 * payload.hostname.length) +
          2 + 2 + 2 * 0 + // Username
          2 + 2 + 2 * 0 + // Password
          2 + 2 + (2 * payload.appName.length) +
          2 + 2 + (2 * payload.serverName.length) +
          2 + 2 + 4 +
          2 + 2 + (2 * payload.libraryName.length) +
          2 + 2 + (2 * payload.language.length) +
          2 + 2 + (2 * payload.database.length) +
          6 + // ClientID
          2 + 2 + (2 * payload.attachDbFile.length) +
          2 + 2 + (2 * payload.changePassword.length) +
          4 + // cbSSPILong
          4 + // Extension offset
          1 + 1 + 4 + 1 + 1; // Feature ext

        assert.lengthOf(data, expectedLength);
      });
    });

    describe('for a login payload with token based authentication', function() {
      it('generates the expected data', function() {
        const token = 'validToken';

        const payload = new Login7Payload({
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
        payload.fedAuth = {
          type: 'SECURITYTOKEN',
          echo: true,
          fedAuthToken: token
        };
        const data = payload.toBuffer();

        const expectedLength =
          4 + // Length
          32 + // Fixed data
          // Variable
          2 + 2 + (2 * payload.hostname.length) +
          2 + 2 + 2 * 0 + // Username
          2 + 2 + 2 * 0 + // Password
          2 + 2 + (2 * payload.appName.length) +
          2 + 2 + (2 * payload.serverName.length) +
          2 + 2 + 4 +
          2 + 2 + (2 * payload.libraryName.length) +
          2 + 2 + (2 * payload.language.length) +
          2 + 2 + (2 * payload.database.length) +
          6 + // ClientID
          2 + 2 + (2 * payload.attachDbFile.length) +
          2 + 2 + (2 * payload.changePassword.length) +
          4 + // cbSSPILong
          4 + // Extension offset
          1 + 4 + 1 + 4 + 1 + (token.length * 2); // Feature ext

        assert.lengthOf(data, expectedLength);
      });
    });
  });
});
