import { AzureActiveDirectoryAccessTokenAuthenticationType } from './azure-active-directory-access-token';
import { AzureActiveDirectoryMsiAppServiceAuthenticationType } from './azure-active-directory-msi-app-service';
import { AzureActiveDirectoryMsiVmAuthenticationType } from './azure-active-directory-msi-vm';
import { AzureActiveDirectoryPasswordAuthenticationType } from './azure-active-directory-password';
import { AzureActiveDirectoryServicePrincipalSecretType } from './azure-active-directory-service-principal-secret';
import { DefaultAuthenticationType } from './default';
import { NtlmAuthenticationType } from './ntlm';

export const SupportedAuthenticationTypes = Object.freeze([
  AzureActiveDirectoryAccessTokenAuthenticationType,
  AzureActiveDirectoryMsiAppServiceAuthenticationType,
  AzureActiveDirectoryMsiVmAuthenticationType,
  AzureActiveDirectoryPasswordAuthenticationType,
  AzureActiveDirectoryServicePrincipalSecretType,
  DefaultAuthenticationType,
  NtlmAuthenticationType,
]);

/**
 * Authentication types that requires FedAuth request
 */
export type FedAuthAuthenticationType = typeof AzureActiveDirectoryPasswordAuthenticationType |
  typeof AzureActiveDirectoryMsiVmAuthenticationType |
  typeof AzureActiveDirectoryMsiAppServiceAuthenticationType |
  typeof AzureActiveDirectoryServicePrincipalSecretType;

/**
 * Active Directory Authentication types
 */
export type AADAuthenticationType = FedAuthAuthenticationType
  | typeof AzureActiveDirectoryAccessTokenAuthenticationType

/**
 * All authentication types
 */
export type AuthenticationType = AADAuthenticationType
  | typeof DefaultAuthenticationType
  | typeof NtlmAuthenticationType;


/**
 * Checks if authentication type requires FedAuth request
 *
 * @param {AuthenticationType} authenticationType
 * @return {boolean}
 */
export function isSupportedAuthenticationType(authenticationType: AuthenticationType): boolean {
  return SupportedAuthenticationTypes.includes(authenticationType);
}

/**
 * Checks if authentication type requires FedAuth request
 *
 * @param {AuthenticationType} authenticationType
 * @return {boolean}
 */
export function isFedAuthAuthenticationType(authenticationType: AuthenticationType): boolean {
  switch (authenticationType) {
    case AzureActiveDirectoryMsiAppServiceAuthenticationType:
    case AzureActiveDirectoryMsiVmAuthenticationType:
    case AzureActiveDirectoryPasswordAuthenticationType:
    case AzureActiveDirectoryServicePrincipalSecretType:
      return true;

    default:
      return false;
  }
}

/**
 * Checks if authentication type is AAD Authentication
 *
 * @param {AuthenticationType} authenticationType
 * @return {boolean}
 */
export function isAADAuthenticationType(authenticationType: AuthenticationType): boolean {
  switch (authenticationType) {
    case AzureActiveDirectoryAccessTokenAuthenticationType:
    case AzureActiveDirectoryMsiAppServiceAuthenticationType:
    case AzureActiveDirectoryMsiVmAuthenticationType:
    case AzureActiveDirectoryPasswordAuthenticationType:
    case AzureActiveDirectoryServicePrincipalSecretType:
      return true;

    default:
      return false;
  }
}
