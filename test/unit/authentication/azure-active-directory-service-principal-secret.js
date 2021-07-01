const { validateAADServicePrincipalSecretOptions } = require('../../../src/authentication/azure-active-directory-service-principal-secret');
const { parseAADServicePrincipalSecretOptions } = require('../../../src/authentication/azure-active-directory-service-principal-secret');
const assert = require('chai').assert;

describe('AzureActiveDirectoryServicePrincipalSecret', () => {
  let authentication;

  beforeEach(() => {
    authentication = { type: 'azure-active-directory-service-principal-secret', options: {} };
  });

  describe('validateAADServicePrincipalSecretOptions', () => {

    it('should not throw an error with valid clientId and clientSecret and tenantId', (done) => {
      authentication.options.clientId = 'clientId';
      authentication.options.clientSecret = 'clientSecret';
      authentication.options.tenantId = 'tenantId';

      assert.doesNotThrow(() => {
        validateAADServicePrincipalSecretOptions(authentication);
      });

      done();
    });

    it('should throw an error without clientId', (done) => {
      authentication.options.clientSecret = 'clientSecret';
      authentication.options.tenantId = 'tenantId';

      assert.throws(() => {
        validateAADServicePrincipalSecretOptions(authentication);
      });

      done();
    });


    it('should throw an error without clientSecret', (done) => {
      authentication.options.clientId = 'clientId';
      authentication.options.tenantId = 'tenantId';

      assert.throws(() => {
        validateAADServicePrincipalSecretOptions(authentication);
      });

      done();
    });


    it('should throw an error without tenantId', (done) => {
      authentication.options.clientId = 'clientId';
      authentication.options.clientSecret = 'clientSecret';

      assert.throws(() => {
        validateAADServicePrincipalSecretOptions(authentication);
      });

      done();
    });

    it('should throw an error without non-string clientId', (done) => {
      authentication.options.clientId = {};
      authentication.options.clientSecret = 'clientSecret';
      authentication.options.tenantId = 'tenantId';

      assert.throws(() => {
        validateAADServicePrincipalSecretOptions(authentication);
      });

      done();
    });

    it('should throw an error without non-string clientSecret', (done) => {
      authentication.options.clientId = 'clientId';
      authentication.options.clientSecret = {};
      authentication.options.tenantId = 'tenantId';


      assert.throws(() => {
        validateAADServicePrincipalSecretOptions(authentication);
      });

      done();
    });

    it('should throw an error without non-string tenantId', (done) => {
      authentication.options.clientId = 'clientId';
      authentication.options.clientSecret = 'clientSecret';
      authentication.options.tenantId = {};

      assert.throws(() => {
        validateAADServicePrincipalSecretOptions(authentication);
      });

      done();
    });

  });

  describe('parseAADServicePrincipalSecretOptions', () => {

    it('should not throw an error with valid username and password', (done) => {
      authentication.options.clientId = 'clientId';
      authentication.options.clientSecret = 'clientSecret';
      authentication.options.tenantId = 'tenantId';

      const parseResults = parseAADServicePrincipalSecretOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.clientId, authentication.options.clientId);
      assert.strictEqual(parseResults.options.clientSecret, authentication.options.clientSecret);
      assert.strictEqual(parseResults.options.tenantId, authentication.options.tenantId);

      done();
    });


    it('should not throw an error with valid username and password and additional options property', (done) => {
      authentication.options.clientId = 'clientId';
      authentication.options.clientSecret = 'clientSecret';
      authentication.options.tenantId = 'tenantId';
      authentication.options.additional = 'property';

      const parseResults = parseAADServicePrincipalSecretOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.clientId, authentication.options.clientId);
      assert.strictEqual(parseResults.options.clientSecret, authentication.options.clientSecret);
      assert.strictEqual(parseResults.options.tenantId, authentication.options.tenantId);
      assert.strictEqual(parseResults.options.additional, undefined);

      done();
    });

  });

});
