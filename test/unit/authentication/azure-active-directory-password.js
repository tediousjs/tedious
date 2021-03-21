const { validateAADPasswordOptions } = require('../../../src/authentication/azure-active-directory-password');
const { parseAADPasswordOptions } = require('../../../src/authentication/azure-active-directory-password');
const assert = require('chai').assert;

describe('AzureActiveDirectoryPasswordAuthentication', () => {
  let authentication;

  beforeEach(() => {
    authentication = { type: 'azure-active-directory-password', options: {} };
  });

  describe('validateAADPasswordOptions', () => {

    it('should not throw an error with valid username and password and domain', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = 'password';
      authentication.options.domain = 'domain.tld';

      assert.doesNotThrow(() => {
        validateAADPasswordOptions(authentication);
      });

      done();
    });

    it('should not throw an error without password', (done) => {
      authentication.options.userName = 'username';
      authentication.options.domain = 'domain.tld';

      assert.doesNotThrow(() => {
        validateAADPasswordOptions(authentication);
      });

      done();
    });


    it('should not throw an error without username', (done) => {
      authentication.options.password = 'password';
      authentication.options.domain = 'domain.tld';

      assert.doesNotThrow(() => {
        validateAADPasswordOptions(authentication);
      });

      done();
    });


    it('should not throw an error without domain', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = 'password';

      assert.doesNotThrow(() => {
        validateAADPasswordOptions(authentication);
      });

      done();
    });

    it('should throw an error with non-string domain', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = 'password';
      authentication.options.domain = {};

      assert.throws(() => {
        validateAADPasswordOptions(authentication);
      });

      done();
    });

    it('should throw an error with non-string username', (done) => {
      authentication.options.userName = {};
      authentication.options.password = 'password';
      authentication.options.domain = 'domain.tld';

      assert.throws(() => {
        validateAADPasswordOptions(authentication);
      });

      done();
    });

    it('should throw an error with non-string password', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = {};
      authentication.options.domain = 'domain.tld';

      assert.throws(() => {
        validateAADPasswordOptions(authentication);
      });

      done();
    });

  });

  describe('parseAADPasswordOptions', () => {

    it('should not throw an error with valid username and password', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = 'password';
      authentication.options.domain = 'domain.tld';

      const parseResults = parseAADPasswordOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.password, authentication.options.password);
      assert.strictEqual(parseResults.options.userName, authentication.options.userName);
      assert.strictEqual(parseResults.options.domain, authentication.options.domain);

      done();
    });


    it('should not throw an error with valid username and password and additional options property', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = 'password';
      authentication.options.domain = 'domain';
      authentication.options.additional = 'property';

      const parseResults = parseAADPasswordOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.password, authentication.options.password);
      assert.strictEqual(parseResults.options.userName, authentication.options.userName);
      assert.strictEqual(parseResults.options.domain, authentication.options.domain);
      assert.strictEqual(parseResults.options.additional, undefined);

      done();
    });

  });

});
