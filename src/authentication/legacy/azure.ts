import { type AuthenticationPlugin } from '../plugin';
import { type AcquiredAccessTokenCredentials, type AuthenticationProvider } from '../provider';
import { assertOptionalStringOption, assertStringOption } from '../options';
import { emitLegacyAuthenticationDeprecationWarning } from './deprecation';
import { loadOptionalDependency } from './optional-dependency';

type AzureIdentity = typeof import('@azure/identity');

/**
 * A credential that can acquire Microsoft Entra ID access tokens.
 *
 * This is structurally compatible with the `TokenCredential` interface
 * from `@azure/core-auth`, so any credential from `@azure/identity`
 * can be used.
 */
export interface TokenCredential {
  getToken(scopes: string | string[], options?: { abortSignal?: AbortSignal }): Promise<{ token: string } | null>;
}

/**
 * Checks whether the given value looks like a [[TokenCredential]].
 *
 * @private
 */
export function isTokenCredential(value: unknown): value is TokenCredential {
  return typeof value === 'object' && value !== null && typeof (value as TokenCredential).getToken === 'function';
}

interface AzureActiveDirectoryMsiAppServiceAuthentication {
  type: 'azure-active-directory-msi-app-service';
  options: {
    /**
     * If you want to connect to an Azure app service using a specific client account,
     * you need to provide the `clientId` associated with your created identity.
     *
     * This is optional for retrieving a token from Azure web app service.
     */
    clientId?: string;
  };
}

interface AzureActiveDirectoryMsiVmAuthentication {
  type: 'azure-active-directory-msi-vm';
  options: {
    /**
     * If you want to connect using a specific client account,
     * you need to provide the `clientId` associated with your created identity.
     *
     * This is optional for retrieving a token.
     */
    clientId?: string;
  };
}

interface AzureActiveDirectoryDefaultAuthentication {
  type: 'azure-active-directory-default';
  options: {
    /**
     * If you want to connect using a specific client account,
     * you need to provide the `clientId` associated with your created identity.
     *
     * This is optional for retrieving a token.
     */
    clientId?: string;
  };
}

interface AzureActiveDirectoryAccessTokenAuthentication {
  type: 'azure-active-directory-access-token';
  options: {
    /**
     * A user needs to provide a `token` which they retrieved elsewhere
     * to form the connection.
     */
    token: string;
  };
}

interface AzureActiveDirectoryPasswordAuthentication {
  type: 'azure-active-directory-password';
  options: {
    /**
     * A user needs to provide a `userName` associated with their account.
     */
    userName: string;

    /**
     * A user needs to provide a `password` associated with their account.
     */
    password: string;

    /**
     * A client id to use.
     */
    clientId: string;

    /**
     * Optional parameter for specific Azure tenant ID
     */
    tenantId: string;
  };
}

interface AzureActiveDirectoryServicePrincipalSecret {
  type: 'azure-active-directory-service-principal-secret';
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

/** Structure that defines the options that are necessary to authenticate the Tedious.JS instance with an `@azure/identity` token credential. */
interface TokenCredentialAuthentication {
  /** Unique designator for the type of authentication to be used. */
  type: 'token-credential';
  /** Set of configurations that are required or allowed with this authentication type. */
  options: {
    /** Credential object used to authenticate to the resource. */
    credential: TokenCredential;
  };
}

export type AzureAuthentication =
  TokenCredentialAuthentication |
  AzureActiveDirectoryPasswordAuthentication |
  AzureActiveDirectoryMsiAppServiceAuthentication |
  AzureActiveDirectoryMsiVmAuthentication |
  AzureActiveDirectoryAccessTokenAuthentication |
  AzureActiveDirectoryServicePrincipalSecret |
  AzureActiveDirectoryDefaultAuthentication;

async function getAccessToken(credential: TokenCredential, resource: string, signal: AbortSignal): Promise<string> {
  /** Permission scope to pass to Entra ID when requesting an authentication token. */
  const tokenScope = new URL('/.default', resource).toString();
  const accessToken = await credential.getToken(tokenScope, { abortSignal: signal });

  if (accessToken === null) {
    throw new Error('The token credential did not return an access token.');
  }

  return accessToken.token;
}

function createAcquiredTokenCredentials(credential: TokenCredential, workflow: AcquiredAccessTokenCredentials['workflow']): AcquiredAccessTokenCredentials {
  return {
    type: 'token',
    workflow: workflow,
    acquireToken({ resource }, signal) {
      return getAccessToken(credential, resource, signal);
    }
  };
}

function createAzureIdentityProvider(authentication: AzureAuthentication, workflow: AcquiredAccessTokenCredentials['workflow'], createCredential: (identity: AzureIdentity) => TokenCredential): AuthenticationProvider {
  return {
    async getCredentials() {
      const identity = await loadOptionalDependency('@azure/identity', authentication.type, () => import('@azure/identity'));
      return createAcquiredTokenCredentials(createCredential(identity), workflow);
    }
  };
}

/**
 * Implements the deprecated Microsoft Entra ID (Azure Active Directory)
 * authentication types on top of the authentication provider API.
 *
 * @private
 */
export function createAzureAuthenticationProvider(authentication: AzureAuthentication): AuthenticationProvider {
  switch (authentication.type) {
    case 'azure-active-directory-access-token': {
      const { token } = authentication.options;
      return {
        getCredentials() {
          return { type: 'token', token: token };
        }
      };
    }

    case 'token-credential': {
      const { credential } = authentication.options;
      return {
        getCredentials() {
          return createAcquiredTokenCredentials(credential, 'integrated');
        }
      };
    }

    case 'azure-active-directory-password': {
      const { tenantId, clientId, userName, password } = authentication.options;
      return createAzureIdentityProvider(authentication, 'password', (identity) => {
        return new identity.UsernamePasswordCredential(tenantId ?? 'common', clientId, userName, password);
      });
    }

    case 'azure-active-directory-msi-vm':
    case 'azure-active-directory-msi-app-service': {
      const { clientId } = authentication.options;
      return createAzureIdentityProvider(authentication, 'integrated', (identity) => {
        return clientId ? new identity.ManagedIdentityCredential(clientId, {}) : new identity.ManagedIdentityCredential({});
      });
    }

    case 'azure-active-directory-default': {
      const { clientId } = authentication.options;
      return createAzureIdentityProvider(authentication, 'integrated', (identity) => {
        return new identity.DefaultAzureCredential(clientId ? { managedIdentityClientId: clientId } : {});
      });
    }

    case 'azure-active-directory-service-principal-secret': {
      const { tenantId, clientId, clientSecret } = authentication.options;
      return createAzureIdentityProvider(authentication, 'integrated', (identity) => {
        return new identity.ClientSecretCredential(tenantId, clientId, clientSecret);
      });
    }
  }
}

/**
 * Creates the plugin for one of the deprecated Microsoft Entra ID
 * authentication types.
 */
function createAzurePlugin<Type extends AzureAuthentication['type']>(type: Type, validate: (options: Record<string, unknown>) => void): AuthenticationPlugin<Record<string, unknown>> {
  return {
    type: type,

    createProvider(options) {
      validate(options);

      emitLegacyAuthenticationDeprecationWarning(type);

      return createAzureAuthenticationProvider({ type: type, options: options } as AzureAuthentication);
    }
  };
}

/**
 * The plugins implementing the deprecated Microsoft Entra ID authentication
 * types.
 *
 * @private
 */
export const azureAuthenticationPlugins: AuthenticationPlugin[] = [
  createAzurePlugin('token-credential', (options) => {
    if (!isTokenCredential(options.credential)) {
      throw new TypeError('The "config.authentication.options.credential" property must be an instance of the token credential class.');
    }
  }),

  createAzurePlugin('azure-active-directory-password', (options) => {
    assertStringOption(options, 'clientId');
    assertOptionalStringOption(options, 'userName');
    assertOptionalStringOption(options, 'password');
    assertOptionalStringOption(options, 'tenantId');
  }),

  createAzurePlugin('azure-active-directory-access-token', (options) => {
    assertStringOption(options, 'token');
  }),

  createAzurePlugin('azure-active-directory-msi-vm', (options) => {
    assertOptionalStringOption(options, 'clientId');
  }),

  createAzurePlugin('azure-active-directory-default', (options) => {
    assertOptionalStringOption(options, 'clientId');
  }),

  createAzurePlugin('azure-active-directory-msi-app-service', (options) => {
    assertOptionalStringOption(options, 'clientId');
  }),

  createAzurePlugin('azure-active-directory-service-principal-secret', (options) => {
    assertStringOption(options, 'clientId');
    assertStringOption(options, 'clientSecret');
    assertStringOption(options, 'tenantId');
  })
];
