const { parseAADMsiVmOptions } = require('../../../src/authentication/azure-active-directory-msi-vm');
const { validateAADMsiVmOptions } = require('../../../src/authentication/azure-active-directory-msi-vm');
const assert = require('chai').assert;

describe('AzureActiveDirectoryMsiVmAuthentication', () => {
  let authentication;

  beforeEach(() => {
    authentication = { type: 'azure-active-directory-msi-vm', options: {} };
  });

  describe('validateAADMsiVmOptions', () => {

    it('should not throw an error without options', (done) => {
      assert.doesNotThrow(() => {
        validateAADMsiVmOptions(authentication);
      });

      done();
    });

    it('should throw an error with non-string clientId', (done) => {
      authentication.options.clientId = {};

      assert.throws(() => {
        validateAADMsiVmOptions(authentication);
      });

      done();
    });

    it('should throw an error with non-string msiEndpoint', (done) => {
      authentication.options.msiEndpoint = {};

      assert.throws(() => {
        validateAADMsiVmOptions(authentication);
      });

      done();
    });

    it('should not throw an error with string clientId', (done) => {
      authentication.options.clientId = 'clientId';

      assert.doesNotThrow(() => {
        validateAADMsiVmOptions(authentication);
      });

      done();
    });

    it('should not throw an error with string msiEndpoint', (done) => {
      authentication.options.msiEndpoint = 'msiEndpoint';

      assert.doesNotThrow(() => {
        validateAADMsiVmOptions(authentication);
      });

      done();
    });

  });

  describe('parseAADMsiVmOptions', () => {

    it('should not throw an error with clientId, msiEndpoint, msiSecret', (done) => {
      authentication.options.clientId = 'clientId';
      authentication.options.msiEndpoint = 'msiEndpoint';

      const parseResults = parseAADMsiVmOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.clientId, authentication.options.clientId);
      assert.strictEqual(parseResults.options.msiEndpoint, authentication.options.msiEndpoint);

      done();
    });


    it('should not throw an error with valid username and password and additional options property', (done) => {
      authentication.options.clientId = 'clientId';
      authentication.options.msiEndpoint = 'msiEndpoint';
      authentication.options.additional = 'additional';

      const parseResults = parseAADMsiVmOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.clientId, authentication.options.clientId);
      assert.strictEqual(parseResults.options.msiEndpoint, authentication.options.msiEndpoint);
      assert.strictEqual(parseResults.options.additional, undefined);

      done();
    });

  });

});
