const NTLMAuthProvider = require('../../../src/auth/ntlm').NTLMAuthProvider;

module.exports = {
  'NTLMAuthProvider.handshake': {
    'without input data': {
      'generates a NTLM NEGOTIATE_MESSAGE message': function(test) {
        const authProvider = new NTLMAuthProvider(null, {});

        const expectedBuffer = new Buffer([
          // Signature
          '4e544c4d53535000',

          // MessageType
          '01000000',

          // NegotiateFlags
          '078208a2',

          // DomainNameFields
          '0000000028000000',

          // WorkstationFields
          '0000000028000000',

          // Version
          '050093080000000f'
        ].join(''), 'hex');

        authProvider.handshake(null, function(error, data) {
          test.ifError(error);

          test.ok(Buffer.isBuffer(data));
          test.strictEqual(data.length, 40);
          test.deepEqual(data, expectedBuffer);

          test.done();
        });
      },

      'generates a NTLM NEGOTIATE_MESSAGE with a workstation name': function(test) {
        const authProvider = new NTLMAuthProvider(null, {
          workstation: 'WORKSTATION'
        });

        const expectedBuffer = new Buffer([
          // Signature
          '4e544c4d53535000',

          // MessageType
          '01000000',

          // NegotiateFlags
          '07a208a2',

          // DomainNameFields
          '0000000033000000',

          // WorkstationFields
          '0b000b0028000000',

          // Version
          '050093080000000f',

          // -- Payload

          // WorkstationName
          '574f524b53544154494f4e'
        ].join(''), 'hex');

        authProvider.handshake(null, function(error, data) {
          test.ifError(error);

          test.ok(Buffer.isBuffer(data));
          test.strictEqual(data.length, 51);
          test.deepEqual(data, expectedBuffer);

          test.done();
        });
      },

      'generates a NTLM NEGOTIATE_MESSAGE with a domain name': function(test) {
        const authProvider = new NTLMAuthProvider(null, {
          domain: 'DOMAIN'
        });

        const expectedBuffer = new Buffer([
          // Signature
          '4e544c4d53535000',

          // MessageType
          '01000000',

          // NegotiateFlags
          '079208a2',

          // DomainNameFields
          '0600060028000000',

          // WorkstationFields
          '0000000028000000',

          // Version
          '050093080000000f',

          // -- Payload

          // DomainName
          '444f4d41494e'
        ].join(''), 'hex');

        authProvider.handshake(null, function(error, data) {
          test.ifError(error);

          test.ok(Buffer.isBuffer(data));
          test.strictEqual(data.length, 46);
          test.deepEqual(data, expectedBuffer);

          test.done();
        });
      },

      'generates a NTLM NEGOTIATE_MESSAGE with a workstation and a domain name': function(test) {
        const authProvider = new NTLMAuthProvider(null, {
          workstation: 'WORKSTATION',
          domain: 'DOMAIN'
        });

        const expectedBuffer = new Buffer([
          // Signature
          '4e544c4d53535000',

          // MessageType
          '01000000',

          // NegotiateFlags
          '07b208a2',

          // DomainNameFields
          '0600060033000000',

          // WorkstationFields
          '0b000b0028000000',

          // Version
          '050093080000000f',

          // -- Payload

          // WorkstationName
          '574f524b53544154494f4e',

          // DomainName
          '444f4d41494e'
        ].join(''), 'hex');

        authProvider.handshake(null, function(error, data) {
          test.ifError(error);

          test.ok(Buffer.isBuffer(data));
          test.strictEqual(data.length, 57);
          test.deepEqual(data, expectedBuffer);

          test.done();
        });
      }
    },

    'with input data': {
      'generates a NTLM AUTHENTICATE_MESSAGE without username or password': function(test) {
        test.done();

        // const authProvider = new NTLMAuthProvider(null, {});
        //
        // const challengeMessage = new Buffer([
        //   '4e544c4d53535000',
        //
        //   '02000000',
        //
        //   '0c000c0030000000',
        //
        //   '01028100',
        //
        //   '0123456789abcdef',
        //
        //   '0000000000000000',
        //
        //   '620062003c000000',
        //
        //   '44004f004d00410049004e00',
        //
        //   '02000c0044004f004d00410049004e00',
        //   '01000c00530045005200560045005200',
        //   '0400140064006f006d00610069006e002e0063006f006d00',
        //   '030022007300650072007600650072002e0064006f006d00610069006e002e0063006f006d00',
        //   '00000000'
        // ].join(''), 'hex');
        //
        // authProvider.handshake(challengeMessage, function(error, data) {
        //   test.ifError(error);
        //
        //   test.ok(Buffer.isBuffer(data));
        //
        //   test.done();
        // });
      },

      'generates a NTLM AUTHENTICATE_MESSAGE with password only': function(test) {
        test.done();
      },

      'generates a NTLM AUTHENTICATE_MESSAGE with username only': function(test) {
        test.done();
      },

      'generates a NTLM AUTHENTICATE_MESSAGE with username and password': function(test) {
        const authProvider = new NTLMAuthProvider(null, {
          username: 'user',
          password: 'SecREt01',
          workstation: 'WORKSTATION',
          domain: 'DOMAIN'
        });

        const challengeMessage = new Buffer([
          '4e544c4d53535000',

          '02000000',

          '0c000c0030000000',

          '01028100',

          '0123456789abcdef',

          '0000000000000000',

          '620062003c000000',

          '44004f004d00410049004e00',

          '02000c0044004f004d00410049004e00',
          '01000c00530045005200560045005200',
          '0400140064006f006d00610069006e002e0063006f006d00',
          '030022007300650072007600650072002e0064006f006d00610069006e002e0063006f006d00',
          '00000000'
        ].join(''), 'hex');

        authProvider.handshake(challengeMessage, function(error, data) {
          test.ifError(error);

          test.ok(Buffer.isBuffer(data));
          test.strictEqual(data.length, 268);

          test.strictEqual(data.slice(0, 8).toString('hex'), '4e544c4d53535000');
          test.strictEqual(data.slice(8, 12).toString('hex'), '03000000');
          test.strictEqual(data.slice(12, 20).toString('hex'), '1800180040000000');
          test.strictEqual(data.slice(20, 28).toString('hex'), '8a008a0058000000');
          test.strictEqual(data.slice(28, 36).toString('hex'), '0c000c00e2000000');
          test.strictEqual(data.slice(36, 44).toString('hex'), '08000800ee000000');
          test.strictEqual(data.slice(44, 52).toString('hex'), '16001600f6000000');
          test.strictEqual(data.slice(52, 60).toString('hex'), '0000000000000000');
          test.strictEqual(data.slice(60, 64).toString('hex'), '01028100');

          test.strictEqual(data.slice(226, 238).toString('ucs2'), 'DOMAIN');
          test.strictEqual(data.slice(238, 246).toString('ucs2'), 'user');
          test.strictEqual(data.slice(246, 268).toString('ucs2'), 'WORKSTATION');

          test.done();
        });
      }
    }
  },

  'NTLMAuthProvider.generateResponseKey': {
    'generates the NTLMv2 response key': function(test) {
      const authProvider = new NTLMAuthProvider(null, {});

      const responseKey = authProvider.generateResponseKey('DOMAIN', 'user', 'SecREt01');

      test.deepEqual(responseKey, Buffer.from('04b8e0ba74289cc540826bab1dee63ae', 'hex'));

      test.done();
    }
  },

  'NTLMAuthProvider.buildLMv2Response': {
    'returns a LMv2 response message': function(test) {
      const authProvider = new NTLMAuthProvider(null, {
        domain: 'DOMAIN',
        username: 'user',
        password: 'SecREt01'
      });

      const responseKey = Buffer.from('04b8e0ba74289cc540826bab1dee63ae', 'hex');
      const serverChallenge = Buffer.from('0123456789abcdef', 'hex');
      const clientChallenge = Buffer.from('ffffff0011223344', 'hex');

      const lmv2Response = authProvider.buildLMv2Response(responseKey, serverChallenge, clientChallenge);
      test.deepEqual(lmv2Response, Buffer.from('d6e6152ea25d03b7c6ba6629c2d6aaf0ffffff0011223344', 'hex'));

      test.done();
    }
  },

  'NTLMAuthProvider.buildNTLMv2Response': {
    'returns a LMv2 response message': function(test) {
      const authProvider = new NTLMAuthProvider(null, {
        domain: 'DOMAIN',
        username: 'user',
        password: 'SecREt01'
      });

      const responseKey = Buffer.from('04b8e0ba74289cc540826bab1dee63ae', 'hex');
      const serverChallenge = Buffer.from('0123456789abcdef', 'hex');
      const clientChallenge = Buffer.from('ffffff0011223344', 'hex');
      const timestampBuffer = Buffer.from('0090d336b734c301', 'hex');
      const targetInfo = Buffer.from('02000c0044004f004d00410049004e0001000c005300450052005600450052000400140064006f006d00610069006e002e0063006f006d00030022007300650072007600650072002e0064006f006d00610069006e002e0063006f006d0000000000', 'hex');

      const ntlmv2Response = authProvider.buildNTLMv2Response(responseKey, targetInfo, timestampBuffer, serverChallenge, clientChallenge);
      test.deepEqual(ntlmv2Response, Buffer.from('cbabbca713eb795d04c97abc01ee498301010000000000000090d336b734c301ffffff00112233440000000002000c0044004f004d00410049004e0001000c005300450052005600450052000400140064006f006d00610069006e002e0063006f006d00030022007300650072007600650072002e0064006f006d00610069006e002e0063006f006d000000000000000000', 'hex'));

      test.done();
    }
  }
};
