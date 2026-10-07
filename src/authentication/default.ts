import { type AuthenticationPlugin } from './plugin';
import { assertOptionalStringOption } from './options';

export interface DefaultAuthenticationOptions {
  /**
   * User name to use for sql server login.
   */
  userName?: string | undefined;
  /**
   * Password to use for sql server login.
   */
  password?: string | undefined;
}

/**
 * The built-in `default` authentication type: SQL Server authentication
 * using a user name and password.
 *
 * @private
 */
export const defaultAuthenticationPlugin: AuthenticationPlugin<DefaultAuthenticationOptions> = {
  type: 'default',

  createProvider(options) {
    assertOptionalStringOption(options as Record<string, unknown>, 'userName');
    assertOptionalStringOption(options as Record<string, unknown>, 'password');

    const { userName, password } = options;
    return {
      getCredentials() {
        return { type: 'password', userName: userName, password: password };
      }
    };
  }
};
