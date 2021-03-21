export const AzureActiveDirectoryMsiVmAuthenticationType = 'azure-active-directory-msi-vm';

export interface AzureActiveDirectoryMsiVmAuthentication {
  type: typeof AzureActiveDirectoryMsiVmAuthenticationType;
  options: {
    /**
     * If you user want to connect to an Azure app service using a specific client account
     * they need to provide `clientId` asscoiate to their created idnetity.
     *
     * This is optional for retrieve token from azure web app service
     */
    clientId?: string;
    /**
     * A user need to provide `msiEndpoint` for retriving the accesstoken.
     */
    msiEndpoint?: string;
  };
}


/**
 * @param {AzureActiveDirectoryMsiVmAuthentication} authentication
 * @throws {TypeError}
 */
export function validateAADMsiVmOptions(authentication: AzureActiveDirectoryMsiVmAuthentication): void {
  const { options } = authentication;

  if (options.clientId !== undefined && typeof options.clientId !== 'string') {
    throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
  }

  if (options.msiEndpoint !== undefined && typeof options.msiEndpoint !== 'string') {
    throw new TypeError('The "config.authentication.options.msiEndpoint" property must be of type string.');
  }

}

/**
 * @param {AzureActiveDirectoryMsiVmAuthentication} authentication
 * @return {AzureActiveDirectoryMsiVmAuthentication}
 */
export function parseAADMsiVmOptions(authentication: AzureActiveDirectoryMsiVmAuthentication): AzureActiveDirectoryMsiVmAuthentication {
  const { options } = authentication;

  return {
    type: AzureActiveDirectoryMsiVmAuthenticationType,
    options: {
      clientId: options.clientId,
      msiEndpoint: options.msiEndpoint,
    },
  };
}
