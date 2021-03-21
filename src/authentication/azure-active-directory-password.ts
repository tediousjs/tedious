export const AzureActiveDirectoryPasswordAuthenticationType = 'azure-active-directory-password';

export interface AzureActiveDirectoryPasswordAuthentication {
  type: typeof AzureActiveDirectoryPasswordAuthenticationType;

  options: {
    /**
     * A user need to provide `userName` asscoiate to their account.
     */
    userName: string;
    /**
     * A user need to provide `password` asscoiate to their account.
     */
    password: string;

    /**
     * Optional parameter for specific Azure tenant ID
     */
    domain: string;
  };
}


/**
 * @param {AzureActiveDirectoryPasswordAuthentication} authentication
 * @throws {TypeError}
 */
export function validateAADPasswordOptions(authentication: AzureActiveDirectoryPasswordAuthentication): void {
  const { options } = authentication;

  if (options.userName !== undefined && typeof options.userName !== 'string') {
    throw new TypeError('The "config.authentication.options.userName" property must be of type string.');
  }

  if (options.password !== undefined && typeof options.password !== 'string') {
    throw new TypeError('The "config.authentication.options.password" property must be of type string.');
  }
}

/**
 * @param {AzureActiveDirectoryPasswordAuthentication} authentication
 * @return {AzureActiveDirectoryPasswordAuthentication}
 */
export function parseAADPasswordOptions(authentication: AzureActiveDirectoryPasswordAuthentication): AzureActiveDirectoryPasswordAuthentication {
  const { options } = authentication;

  return {
    type: AzureActiveDirectoryPasswordAuthenticationType,
    options: {
      userName: options.userName,
      password: options.password,
      domain: options.domain,
    },
  };
}
