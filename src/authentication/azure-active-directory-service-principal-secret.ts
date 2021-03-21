export const AzureActiveDirectoryServicePrincipalSecretType = 'azure-active-directory-service-principal-secret';

export interface AzureActiveDirectoryServicePrincipalSecret {
  type: typeof AzureActiveDirectoryServicePrincipalSecretType;
  options: {
    /**
     * Application (`client`) ID from your registered Azure application
     */
    clientId: string;
    /**
     * The created `client secret` for this registered Azure application
     */
    clientSecret: string;
    /**
     * Directory (`tenant`) ID from your registered Azure application
     */
    tenantId: string;
  };
}


/**
 * @param {AzureActiveDirectoryServicePrincipalSecret} authentication
 * @throws {TypeError}
 */
export function validateAADServicePrincipalSecretOptions(authentication: AzureActiveDirectoryServicePrincipalSecret): void {
  const { options } = authentication;

  if (typeof options.clientId !== 'string') {
    throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
  }

  if (typeof options.clientSecret !== 'string') {
    throw new TypeError('The "config.authentication.options.clientSecret" property must be of type string.');
  }

  if (typeof options.tenantId !== 'string') {
    throw new TypeError('The "config.authentication.options.tenantId" property must be of type string.');
  }

}

/**
 * @param {AzureActiveDirectoryServicePrincipalSecret} authentication
 * @return {AzureActiveDirectoryServicePrincipalSecret}
 */
export function parseAADServicePrincipalSecretOptions(authentication: AzureActiveDirectoryServicePrincipalSecret): AzureActiveDirectoryServicePrincipalSecret {
  const { options } = authentication;

  return {
    type: AzureActiveDirectoryServicePrincipalSecretType,
    options: {
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      tenantId: options.tenantId,
    },
  };
}
