const { parseAADMsiAppServiceOptions } = require('../../../src/authentication/azure-active-directory-msi-app-service');
const { validateAADMsiAppServiceOptions } = require('../../../src/authentication/azure-active-directory-msi-app-service');
const assert = require('chai').assert;

describe('AzureActiveDirectoryMsiAppServiceAuthentication', () => {
  let authentication;

  beforeEach(() => {
    authentication = { type: 'azure-active-directory-msi-app-service', options: {} };
  });

  describe('validateAADMsiAppServiceOptions', () => {

    it('should not throw an error without options', (done) => {
      assert.doesNotThrow(() => {
        validateAADMsiAppServiceOptions(authentication);
      });

      done();
    });

    it('should throw an error with non-string clientId', (done) => {
      authentication.options.clientId = {};

      assert.throws(() => {
        validateAADMsiAppServiceOptions(authentication);
      });

      done();
    });

    it('should throw an error with non-string msiEndpoint', (done) => {
      authentication.options.msiEndpoint = {};

      assert.throws(() => {
        validateAADMsiAppServiceOptions(authentication);
      });

      done();
    });

    it('should throw an error with non-string msiSecret', (done) => {
      authentication.options.msiSecret = {};

      assert.throws(() => {
        validateAADMsiAppServiceOptions(authentication);
      });

      done();
    });


    it('should not throw an error with string clientId', (done) => {
      authentication.options.clientId = 'clientId';

      assert.doesNotThrow(() => {
        validateAADMsiAppServiceOptions(authentication);
      });

      done();
    });

    it('should not throw an error with string msiEndpoint', (done) => {
      authentication.options.msiEndpoint = 'msiEndpoint';

      assert.doesNotThrow(() => {
        validateAADMsiAppServiceOptions(authentication);
      });

      done();
    });

    it('should not throw an error with string msiSecret', (done) => {
      authentication.options.msiSecret = 'msiSecret';

      assert.doesNotThrow(() => {
        validateAADMsiAppServiceOptions(authentication);
      });

      done();
    });


  });

  describe('parseAADMsiAppServiceOptions', () => {

    it('should not throw an error with clientId, msiEndpoint, msiSecret', (done) => {
      authentication.options.clientId = 'clientId';
      authentication.options.msiEndpoint = 'msiEndpoint';
      authentication.options.msiSecret = 'msiSecret';

      const parseResults = parseAADMsiAppServiceOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.clientId, authentication.options.clientId);
      assert.strictEqual(parseResults.options.msiEndpoint, authentication.options.msiEndpoint);
      assert.strictEqual(parseResults.options.msiSecret, authentication.options.msiSecret);

      done();
    });


    it('should not throw an error with valid username and password and additional options property', (done) => {
      authentication.options.clientId = 'clientId';
      authentication.options.msiEndpoint = 'msiEndpoint';
      authentication.options.msiSecret = 'msiSecret';
      authentication.options.additional = 'additional';

      const parseResults = parseAADMsiAppServiceOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.clientId, authentication.options.clientId);
      assert.strictEqual(parseResults.options.msiEndpoint, authentication.options.msiEndpoint);
      assert.strictEqual(parseResults.options.msiSecret, authentication.options.msiSecret);
      assert.strictEqual(parseResults.options.additional, undefined);

      done();
    });

  });

});
