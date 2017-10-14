const NTLMAuthProvider = require('../../../src/auth/ntlm');

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
          test.ifError();

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
          test.ifError();

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
          test.ifError();

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
          test.ifError();

          test.ok(Buffer.isBuffer(data));
          test.strictEqual(data.length, 57);
          test.deepEqual(data, expectedBuffer);

          test.done();
        });
      }
    },

    'calls the given callback with an initial NTLM packet when no input data is given': function(test) {
      const authProvider = new NTLMAuthProvider(null, {
        domain: 'DOMAIN',
        workstation: 'WORKSTATION'
      });

      // 4e544c4d53535000 01000000 07320000 0600060033000000 0b000b0028000000 050093080000000f 574f524b53544154494f4e 444f4d41494e
      // 4e544c4d53535000 01000000 07b208a2 0600060033000000 0b000b0028000000 050093080000000f 574f524b53544154494f4e 444f4d41494e

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
        test.ifError();

        test.ok(Buffer.isBuffer(data));
        test.strictEqual(data.length, 57);
        test.deepEqual(data, expectedBuffer);

        test.done();
      });
    },

    'calls the given callback with a response NTLM packet when valid input data is given': function(test) {
      const authProvider = new NTLMAuthProvider(null, {
        domain: 'domain',
        username: 'username',
        password: 'password'
      });

      authProvider.handshake(null, function(error, data) {
        test.ifError();

        test.ok(Buffer.isBuffer(data));
        test.strictEqual(data.length, 46);

        test.done();
      });
    }
  }
};
