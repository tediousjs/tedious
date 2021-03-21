const { isAADAuthenticationType } = require('../../../src/authentication/authentication-types');
const { isFedAuthAuthenticationType } = require('../../../src/authentication/authentication-types');
const { isSupportedAuthenticationType } = require('../../../src/authentication/authentication-types');
const assert = require('chai').assert;

describe('AuthenticationTypes', () => {

  describe('isSupportedAuthenticationType', () => {
    it('should accept azure-active-directory-access-token type', (done) => {
      assert.strictEqual(isSupportedAuthenticationType('azure-active-directory-access-token'), true);
      done();
    });

    it('should accept azure-active-directory-msi-app-service type', (done) => {
      assert.strictEqual(isSupportedAuthenticationType('azure-active-directory-msi-app-service'), true);
      done();
    });

    it('should accept azure-active-directory-msi-vm type', (done) => {
      assert.strictEqual(isSupportedAuthenticationType('azure-active-directory-msi-vm'), true);
      done();
    });

    it('should accept azure-active-directory-password type', (done) => {
      assert.strictEqual(isSupportedAuthenticationType('azure-active-directory-password'), true);
      done();
    });

    it('should accept azure-active-directory-service-principal-secret type', (done) => {
      assert.strictEqual(isSupportedAuthenticationType('azure-active-directory-service-principal-secret'), true);
      done();
    });

    it('should accept default type', (done) => {
      assert.strictEqual(isSupportedAuthenticationType('default'), true);
      done();
    });

    it('should accept ntlm type', (done) => {
      assert.strictEqual(isSupportedAuthenticationType('ntlm'), true);
      done();
    });

    it('shouldn\'t accept unknown type', (done) => {
      assert.strictEqual(isSupportedAuthenticationType('unknown'), false);
      done();
    });
  });

  describe('isFedAuthAuthenticationType', () => {
    it('should accept azure-active-directory-msi-app-service type', (done) => {
      assert.strictEqual(isFedAuthAuthenticationType('azure-active-directory-msi-app-service'), true);
      done();
    });

    it('should accept azure-active-directory-msi-vm type', (done) => {
      assert.strictEqual(isFedAuthAuthenticationType('azure-active-directory-msi-vm'), true);
      done();
    });

    it('should accept azure-active-directory-password type', (done) => {
      assert.strictEqual(isFedAuthAuthenticationType('azure-active-directory-password'), true);
      done();
    });

    it('should accept azure-active-directory-service-principal-secret type', (done) => {
      assert.strictEqual(isFedAuthAuthenticationType('azure-active-directory-service-principal-secret'), true);
      done();
    });

    it('shouldn\'t accept azure-active-directory-access-token type', (done) => {
      assert.strictEqual(isFedAuthAuthenticationType('azure-active-directory-access-token'), false);
      done();
    });

    it('shouldn\'t accept default type', (done) => {
      assert.strictEqual(isFedAuthAuthenticationType('default'), false);
      done();
    });

    it('shouldn\'t accept ntlm type', (done) => {
      assert.strictEqual(isFedAuthAuthenticationType('ntlm'), false);
      done();
    });
  });

  describe('isAADAuthenticationType', () => {
    it('should accept azure-active-directory-msi-app-service type', (done) => {
      assert.strictEqual(isAADAuthenticationType('azure-active-directory-msi-app-service'), true);
      done();
    });

    it('should accept azure-active-directory-msi-vm type', (done) => {
      assert.strictEqual(isAADAuthenticationType('azure-active-directory-msi-vm'), true);
      done();
    });

    it('should accept azure-active-directory-password type', (done) => {
      assert.strictEqual(isAADAuthenticationType('azure-active-directory-password'), true);
      done();
    });

    it('should accept azure-active-directory-service-principal-secret type', (done) => {
      assert.strictEqual(isAADAuthenticationType('azure-active-directory-service-principal-secret'), true);
      done();
    });

    it('should accept azure-active-directory-access-token type', (done) => {
      assert.strictEqual(isAADAuthenticationType('azure-active-directory-access-token'), true);
      done();
    });

    it('shouldn\'t accept default type', (done) => {
      assert.strictEqual(isAADAuthenticationType('default'), false);
      done();
    });

    it('shouldn\'t accept ntlm type', (done) => {
      assert.strictEqual(isAADAuthenticationType('ntlm'), false);
      done();
    });
  });
});
