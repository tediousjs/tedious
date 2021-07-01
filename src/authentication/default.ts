export const DefaultAuthenticationType = 'default';

export interface DefaultAuthentication {
  type: typeof DefaultAuthenticationType;
  options: {
    /**
     * User name to use for sql server login.
     */
    userName?: string;
    /**
     * Password to use for sql server login.
     */
    password?: string;
  };
}


/**
 * @param {DefaultAuthentication} authentication
 * @throws {TypeError}
 */
export function validateDefaultOptions(authentication: DefaultAuthentication): void {
  const { options } = authentication;

  if (options.userName !== undefined && typeof options.userName !== 'string') {
    throw new TypeError('The "config.authentication.options.userName" property must be of type string.');
  }

  if (options.password !== undefined && typeof options.password !== 'string') {
    throw new TypeError('The "config.authentication.options.password" property must be of type string.');
  }

}

/**
 * @param {DefaultAuthentication} authentication
 * @return {DefaultAuthentication}
 */
export function parseDefaultOptions(authentication: DefaultAuthentication): DefaultAuthentication {
  const { options } = authentication;

  return {
    type: DefaultAuthenticationType,
    options: {
      userName: options.userName,
      password: options.password,
    },
  };
}

/**
 * @return {DefaultAuthentication}
 */
export function parseDefaultAnonymousOptions(): DefaultAuthentication {
  return {
    type: DefaultAuthenticationType,
    options: {
      userName: undefined,
      password: undefined,
    },
  };
}
