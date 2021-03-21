export const AzureActiveDirectoryMsiAppServiceAuthenticationType = 'azure-active-directory-msi-app-service';

export interface AzureActiveDirectoryMsiAppServiceAuthentication {
  type: typeof AzureActiveDirectoryMsiAppServiceAuthenticationType;
  options: {
    /**
     * If you user want to connect to an Azure app service using a specific client account
     * they need to provide `clientId` asscoiate to their created idnetity.
     *
     * This is optional for retrieve token from azure web app service
     */
    clientId?: string;
    /**
     * A msi app service environment need to provide `msiEndpoint` for retriving the accesstoken.
     */
    msiEndpoint?: string;
    /**
     * A msi app service environment need to provide `msiSecret` for retriving the accesstoken.
     */
    msiSecret?: string;
  };
}


/**
 * @param {AzureActiveDirectoryMsiAppServiceAuthentication} authentication
 * @throws {TypeError}
 */
export function validateAADMsiAppServiceOptions(authentication: AzureActiveDirectoryMsiAppServiceAuthentication): void {
  const { options } = authentication;

  if (options.clientId !== undefined && typeof options.clientId !== 'string') {
    throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
  }

  if (options.msiEndpoint !== undefined && typeof options.msiEndpoint !== 'string') {
    throw new TypeError('The "config.authentication.options.msiEndpoint" property must be of type string.');
  }

  if (options.msiSecret !== undefined && typeof options.msiSecret !== 'string') {
    throw new TypeError('The "config.authentication.options.msiSecret" property must be of type string.');
  }

}

/**
 * @param {AzureActiveDirectoryMsiAppServiceAuthentication} authentication
 * @return {AzureActiveDirectoryMsiAppServiceAuthentication}
 */
export function parseAADMsiAppServiceOptions(authentication: AzureActiveDirectoryMsiAppServiceAuthentication): AzureActiveDirectoryMsiAppServiceAuthentication {
  const { options } = authentication;

  return {
    type: AzureActiveDirectoryMsiAppServiceAuthenticationType,
    options: {
      clientId: options.clientId,
      msiEndpoint: options.msiEndpoint,
      msiSecret: options.msiSecret,
    },
  };
}
