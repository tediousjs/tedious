const { validateNtlmOptions, parseNtlmOptions } = require('../../../src/authentication/ntlm');
const assert = require('chai').assert;

describe('NtlmAuthentication', () => {
  let authentication;

  beforeEach(() => {
    authentication = { type: 'ntlm', options: {} };
  });

  describe('validateNtlmOptions', () => {
    it('should not throw an error with valid username and password and domain', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = 'password';
      authentication.options.domain = 'domain.tld';

      assert.doesNotThrow(() => {
        validateNtlmOptions(authentication);
      });

      done();
    });

    it('should not throw an error without password', (done) => {
      authentication.options.userName = 'username';
      authentication.options.domain = 'domain.tld';

      assert.doesNotThrow(() => {
        validateNtlmOptions(authentication);
      });

      done();
    });


    it('should not throw an error without username', (done) => {
      authentication.options.password = 'password';
      authentication.options.domain = 'domain.tld';

      assert.doesNotThrow(() => {
        validateNtlmOptions(authentication);
      });

      done();
    });


    it('should throw an error without domain', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = 'password';

      assert.throws(() => {
        validateNtlmOptions(authentication);
      });

      done();
    });

    it('should throw an error without non-string domain', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = 'password';
      authentication.options.domain = {};

      assert.throws(() => {
        validateNtlmOptions(authentication);
      });

      done();
    });

    it('should throw an error with non-string username', (done) => {
      authentication.options.userName = {};
      authentication.options.password = 'password';
      authentication.options.domain = 'domain.tld';

      assert.throws(() => {
        validateNtlmOptions(authentication);
      });

      done();
    });

    it('should throw an error with non-string password', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = {};
      authentication.options.domain = 'domain.tld';

      assert.throws(() => {
        validateNtlmOptions(authentication);
      });

      done();
    });

  });

  describe('parseDefaultOptions', () => {

    it('should not throw an error with valid username and password', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = 'password';
      authentication.options.domain = 'domain.tld';

      const parseResults = parseNtlmOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.password, authentication.options.password);
      assert.strictEqual(parseResults.options.userName, authentication.options.userName);
      assert.strictEqual(parseResults.options.domain, authentication.options.domain.toUpperCase());

      done();
    });


    it('should not throw an error with valid username and password and additional options property', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = 'password';
      authentication.options.domain = 'domain';
      authentication.options.additional = 'property';

      const parseResults = parseNtlmOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.password, authentication.options.password);
      assert.strictEqual(parseResults.options.userName, authentication.options.userName);
      assert.strictEqual(parseResults.options.domain, authentication.options.domain.toUpperCase());
      assert.strictEqual(parseResults.options.additional, undefined);

      done();
    });

  });

});
