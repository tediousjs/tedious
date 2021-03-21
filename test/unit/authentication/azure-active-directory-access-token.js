const { parseAADAccessTokenOptions } = require('../../../src/authentication/azure-active-directory-access-token');
const { validateAADAccessTokenOptions } = require('../../../src/authentication/azure-active-directory-access-token');
const assert = require('chai').assert;

describe('AzureActiveDirectoryAccessTokenAuthentication', () => {
  let authentication;

  beforeEach(() => {
    authentication = { type: 'azure-active-directory-access-token', options: {} };
  });

  describe('validateAADAccessTokenOptions', () => {
    it('should not throw an error with valid token', (done) => {
      authentication.options.token = 'token';

      assert.doesNotThrow(() => {
        validateAADAccessTokenOptions(authentication);
      });

      done();
    });

    it('should throw an error without token', (done) => {
      assert.throws(() => {
        validateAADAccessTokenOptions(authentication);
      });

      done();
    });

    it('should throw an error with non-string token', (done) => {
      authentication.options.token = {};

      assert.throws(() => {
        validateAADAccessTokenOptions(authentication);
      });

      done();
    });

  });

  describe('parseAADAccessTokenOptions', () => {


    it('should not throw an error with token', (done) => {
      authentication.options.token = 'token';

      const parseResults = parseAADAccessTokenOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.token, authentication.options.token);

      done();
    });


    it('should not throw an error with valid username and password and additional options property', (done) => {
      authentication.options.token = 'token';
      authentication.options.additional = 'property';

      const parseResults = parseAADAccessTokenOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.token, authentication.options.token);
      assert.strictEqual(parseResults.options.additional, undefined);

      done();
    });

  });

});
