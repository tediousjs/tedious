export const AzureActiveDirectoryAccessTokenAuthenticationType = 'azure-active-directory-access-token';

export interface AzureActiveDirectoryAccessTokenAuthentication {
  type: typeof AzureActiveDirectoryAccessTokenAuthenticationType;
  options: {
    /**
     * A user need to provide `token` which they retrived else where
     * to forming the connection.
     */
    token: string;
  };
}

/**
 * @param {AzureActiveDirectoryAccessTokenAuthentication} authentication
 * @throws {TypeError}
 */
export function validateAADAccessTokenOptions(authentication: AzureActiveDirectoryAccessTokenAuthentication): void {
  const { options } = authentication;

  if (typeof options.token !== 'string') {
    throw new TypeError('The "config.authentication.options.token" property must be of type string.');
  }
}

/**
 * @param {AzureActiveDirectoryAccessTokenAuthentication} authentication
 * @return {AzureActiveDirectoryAccessTokenAuthentication}
 */
export function parseAADAccessTokenOptions(authentication: AzureActiveDirectoryAccessTokenAuthentication): AzureActiveDirectoryAccessTokenAuthentication {
  const { options } = authentication;

  return {
    type: AzureActiveDirectoryAccessTokenAuthenticationType,
    options: {
      token: options.token,
    },
  };
}
