import { assert } from 'chai';
import Login7Payload from '../../src/login7-payload';

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
          0; // No FeatureExt for TDS 7.2

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

        const expectedLength =
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
          0; // No FeatureExt for TDS 7.2

        assert.lengthOf(data, expectedLength);
      });
    });

    describe('for a login payload with active directory authentication', function() {
      it('generates the expected data', function() {
        const payload = new Login7Payload({
          tdsVersion: 0x74000004,
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
          1 + (1 + 4 + 1) + (1 + 4 + 1) + 1; // Feature ext - v7.4 includes UTF8_SUPPORT unlike prior versions

        assert.lengthOf(data, expectedLength);
      });
    });

    describe('for a login payload with token based authentication', function() {
      it('generates the expected data', function() {
        const token = 'validToken';

        const payload = new Login7Payload({
          tdsVersion: 0x74000004,
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
          (1 + 4 + 1 + 4 + (token.length * 2)) + // SECURITYTOKEN feature
          (1 + 4 + 1) + // UTF8_SUPPORT feature
          1; // Terminator

        assert.lengthOf(data, expectedLength);
      });
    });

    describe('for a fabric login payload with active directory authentication', function() {
      it('generates the expected data', function() {
        const payload = new Login7Payload({
          tdsVersion: 0x74000004,
          packetSize: 1024,
          clientProgVer: 0,
          clientPid: 12345,
          connectionId: 0,
          clientTimeZone: 120,
          clientLcid: 0x00000409,
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
          1 + (1 + 4 + 1) + (1 + 4 + 1) + 1; // Feature ext - v7.4 includes UTF8_SUPPORT unlike prior versions

        assert.lengthOf(data, expectedLength);
      });
    });

    describe('FeatureExt positioning per MS-TDS spec', function() {
      it('places ibFeatureExtLong offset pointer at the correct position', function() {
        const payload = new Login7Payload({
          tdsVersion: 0x74000004,
          packetSize: 1024,
          clientProgVer: 0,
          clientPid: 12345,
          connectionId: 0,
          clientTimeZone: 120,
          clientLcid: 0x00000409,
        });

        payload.hostname = 'testhost';
        payload.userName = 'testuser';
        payload.password = 'testpass';
        payload.appName = 'TestApp';
        payload.serverName = 'testserver';
        payload.language = 'us_english';
        payload.database = 'master';
        payload.libraryName = 'Tedious';
        payload.fedAuth = {
          type: 'ADAL',
          echo: true,
          workflow: 'default'
        };

        const data = payload.toBuffer();

        // ibExtension is at fixed offset 56 (2 bytes for offset, 2 bytes for length)
        const ibExtension = data.readUInt16LE(56);
        const cbExtension = data.readUInt16LE(58);

        // cbExtension should be 4 (the size of the ibFeatureExtLong pointer)
        assert.strictEqual(cbExtension, 4, 'cbExtension should be 4 bytes (ibFeatureExtLong pointer size)');

        // Read the ibFeatureExtLong value (4-byte offset to FeatureExt data)
        const ibFeatureExtLong = data.readUInt32LE(ibExtension);

        // Verify ibFeatureExtLong points to a valid position in the packet
        assert.isAtLeast(ibFeatureExtLong, 94, 'ibFeatureExtLong should point past the fixed header');
        assert.isBelow(ibFeatureExtLong, data.length, 'ibFeatureExtLong should point within the packet');

        // Verify FeatureExt data starts at the position pointed to by ibFeatureExtLong
        // First feature should be FEDAUTH (0x02) or UTF8_SUPPORT (0x0A)
        const firstFeatureId = data.readUInt8(ibFeatureExtLong);
        assert.oneOf(firstFeatureId, [0x02, 0x0A], 'First feature should be FEDAUTH (0x02) or UTF8_SUPPORT (0x0A)');

        // Find all variable data fields to verify FeatureExt is at the END
        // Fixed header layout (after ClientLCID at offset 32-35):
        // 36-39: ibHostName/cchHostName, 40-43: ibUserName/cchUserName
        // 44-47: ibPassword/cchPassword, 48-51: ibAppName/cchAppName
        // 52-55: ibServerName/cchServerName, 56-59: ibExtension/cbExtension
        // 60-63: ibCltIntName/cchCltIntName, 64-67: ibLanguage/cchLanguage
        // 68-71: ibDatabase/cchDatabase, 72-77: ClientID (6 bytes)
        // 78-81: ibSSPI/cbSSPI, 82-85: ibAtchDBFile/cchAtchDBFile
        // 86-89: ibChangePassword/cchChangePassword, 90-93: cbSSPILong
        const ibHostName = data.readUInt16LE(36);
        const cchHostName = data.readUInt16LE(38);
        const ibDatabase = data.readUInt16LE(68);
        const cchDatabase = data.readUInt16LE(70);
        const ibAttachDBFile = data.readUInt16LE(82);
        const cchAttachDBFile = data.readUInt16LE(84);
        const ibChangePassword = data.readUInt16LE(86);
        const cchChangePassword = data.readUInt16LE(88);

        // Calculate the end of all regular variable data (excluding FeatureExt)
        const variableDataEnd = Math.max(
          ibHostName + cchHostName * 2,
          ibDatabase + cchDatabase * 2,
          ibAttachDBFile + cchAttachDBFile * 2,
          ibChangePassword + cchChangePassword * 2
        );

        // FeatureExt should start after all other variable data
        assert.isAtLeast(ibFeatureExtLong, variableDataEnd,
          'FeatureExt (at ' + ibFeatureExtLong + ') should be after all variable data (ends at ' + variableDataEnd + ')');

        // Verify FeatureExt ends with terminator (0xFF)
        // Find the terminator by scanning from ibFeatureExtLong
        let featureOffset = ibFeatureExtLong;
        while (featureOffset < data.length) {
          const featureId = data.readUInt8(featureOffset);
          if (featureId === 0xFF) {
            // Found terminator, verify it's at the end of the packet
            assert.strictEqual(featureOffset, data.length - 1,
              'FeatureExt terminator should be the last byte of the packet');
            break;
          }
          // Skip past this feature: 1 byte ID + 4 bytes length + length bytes data
          const featureLen = data.readUInt32LE(featureOffset + 1);
          featureOffset += 1 + 4 + featureLen;
        }
      });

      it('correctly positions FeatureExt when SSPI data is present', function() {
        const payload = new Login7Payload({
          tdsVersion: 0x74000004,
          packetSize: 1024,
          clientProgVer: 0,
          clientPid: 12345,
          connectionId: 0,
          clientTimeZone: 120,
          clientLcid: 0x00000409,
        });

        payload.hostname = 'testhost';
        payload.appName = 'TestApp';
        payload.serverName = 'testserver';
        payload.language = 'us_english';
        payload.database = 'master';
        payload.libraryName = 'Tedious';
        // Add SSPI data to test offset calculation
        payload.sspi = Buffer.from([0x4E, 0x54, 0x4C, 0x4D, 0x53, 0x53, 0x50, 0x00]); // "NTLMSSP\0"
        payload.fedAuth = {
          type: 'ADAL',
          echo: true,
          workflow: 'default'
        };

        const data = payload.toBuffer();

        // Read the ibExtension and ibFeatureExtLong
        const ibExtension = data.readUInt16LE(56);
        const ibFeatureExtLong = data.readUInt32LE(ibExtension);

        // ibSSPI is at offset 78, cbSSPI at offset 80 (after ClientID at 72-77)
        const ibSSPI = data.readUInt16LE(78);
        const cbSSPI = data.readUInt16LE(80);

        // SSPI data should be present in the packet
        assert.strictEqual(cbSSPI, 8, 'SSPI length should be 8 bytes');

        // FeatureExt should be after SSPI data
        const sspiEnd = ibSSPI + cbSSPI;
        assert.isAtLeast(ibFeatureExtLong, sspiEnd,
          'FeatureExt should be after SSPI data');

        // Verify first feature is valid
        const firstFeatureId = data.readUInt8(ibFeatureExtLong);
        assert.oneOf(firstFeatureId, [0x02, 0x0A], 'First feature should be FEDAUTH (0x02) or UTF8_SUPPORT (0x0A)');
      });
    });
  });
});
