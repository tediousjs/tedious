export const NtlmAuthenticationType = 'ntlm';

export interface NtlmAuthentication {
  type: typeof NtlmAuthenticationType;
  options: {
    /**
     * User name from your windows account.
     */
    userName: string;
    /**
     * Password from your windows account.
     */
    password: string;
    /**
     * Once you set domain for ntlm authentication type, driver will connect to SQL Server using domain login.
     *
     * This is necessary for forming a connection using ntlm type
     */
    domain: string;
  };
}

/**
 * @param {NtlmAuthentication} authentication
 * @throws {TypeError}
 */
export function validateNtlmOptions(authentication: NtlmAuthentication): void {
  const { options } = authentication;

  if (typeof options.domain !== 'string') {
    throw new TypeError('The "config.authentication.options.domain" property must be of type string.');
  }

  if (options.userName !== undefined && typeof options.userName !== 'string') {
    throw new TypeError('The "config.authentication.options.userName" property must be of type string.');
  }

  if (options.password !== undefined && typeof options.password !== 'string') {
    throw new TypeError('The "config.authentication.options.password" property must be of type string.');
  }
}

/**
 * @param {NtlmAuthentication} authentication
 * @return {NtlmAuthentication}
 */
export function parseNtlmOptions(authentication: NtlmAuthentication): NtlmAuthentication {
  const { options } = authentication;

  return {
    type: NtlmAuthenticationType,
    options: {
      userName: options.userName,
      password: options.password,
      domain: options.domain && options.domain.toUpperCase(),
    },
  };
}
