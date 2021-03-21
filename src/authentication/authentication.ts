import { AzureActiveDirectoryAccessTokenAuthentication } from './azure-active-directory-access-token';
import { AzureActiveDirectoryServicePrincipalSecret } from './azure-active-directory-service-principal-secret';
import { AzureActiveDirectoryPasswordAuthentication } from './azure-active-directory-password';
import { AzureActiveDirectoryMsiVmAuthentication } from './azure-active-directory-msi-vm';
import { AzureActiveDirectoryMsiAppServiceAuthentication } from './azure-active-directory-msi-app-service';
import { DefaultAuthentication } from './default';
import { NtlmAuthentication } from './ntlm';

/**
 * FedAuth authentications
 */
export type FedAuthAuthentication = AzureActiveDirectoryPasswordAuthentication
  | AzureActiveDirectoryMsiVmAuthentication
  | AzureActiveDirectoryMsiAppServiceAuthentication
  | AzureActiveDirectoryServicePrincipalSecret;

/**
 * All supported authentications
 */
export type Authentication = FedAuthAuthentication
  | AzureActiveDirectoryAccessTokenAuthentication
  | DefaultAuthentication
  | NtlmAuthentication;
