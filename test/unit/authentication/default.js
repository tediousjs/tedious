const { validateDefaultOptions, parseDefaultOptions } = require('../../../src/authentication/default');
const assert = require('chai').assert;

describe('DefaultAuthentication', () => {
  let authentication;

  beforeEach(() => {
    authentication = { type: 'default', options: {} };
  });

  describe('validateDefaultOptions', () => {
    it('should not throw an error with valid username and password', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = 'password';

      assert.doesNotThrow(() => {
        validateDefaultOptions(authentication);
      });

      done();
    });

    it('should not throw an error with undefined username and password', (done) => {
      assert.doesNotThrow(() => {
        validateDefaultOptions(authentication);
      });

      done();
    });


    it('should throw an error with null username and password', (done) => {
      authentication.options.userName = null;
      authentication.options.password = null;

      assert.throws(() => {
        validateDefaultOptions(authentication);
      });

      done();
    });

    it('should throw an error with non-string userName', (done) => {
      authentication.options.userName = {};
      authentication.options.password = 'password';

      assert.throws(() => {
        validateDefaultOptions(authentication);
      });

      done();
    });

    it('should throw an error with non-string password', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = {};

      assert.throws(() => {
        validateDefaultOptions(authentication);
      });

      done();
    });

  });

  describe('parseDefaultOptions', () => {

    it('should not throw an error with valid username and password', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = 'password';

      const parseResults = parseDefaultOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.password, authentication.options.password);
      assert.strictEqual(parseResults.options.userName, authentication.options.userName);

      done();
    });


    it('should not throw an error with valid username and password and additional options property', (done) => {
      authentication.options.userName = 'username';
      authentication.options.password = 'password';
      authentication.options.additional = 'property';

      const parseResults = parseDefaultOptions(authentication);

      assert.strictEqual(parseResults.type, authentication.type);
      assert.strictEqual(parseResults.options.password, authentication.options.password);
      assert.strictEqual(parseResults.options.userName, authentication.options.userName);
      assert.strictEqual(parseResults.options.additional, undefined);

      done();
    });

  });

});
