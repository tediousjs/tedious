import Request from './request';
import BulkLoad from './bulk-load';
import Debug from './debug';

import { SecureContext } from 'tls';

import { ConnectionError } from './errors';

import {
  State,
  ConnectingState,
  SentPreloginState,
  ReRoutingState,
  TransientFailureRetryState,
  SentTLSSSLNegotiationState,
  SentLogin7WithStandardLoginState,
  SentLogin7WithNTLMLoginState,
  SentLogin7WithFedauthState,
  LoggedInSendingInitialSqlState,
  LoggedInState,
  BuildingClientRequestState,
  SentClientRequestState,
  SentAttentionState,
  FinalState
} from './state';

export type ConnectionOptions = {
  tdsVersion: string,
  encrypt: boolean,
  trustServerCertificate: boolean,
  database?: string,
  requestTimeout: number,
  cancelTimeout: number
};

type InternalConfig = {
  server: string,
  options: ConnectionOptions,
  authentication: AzureActiveDirectoryMsiVmAuthentication | AzureActiveDirectoryPasswordAuthentication | AzureActiveDirectoryMsiAppService | AzureActiveDirectoryAccessToken | NtlmAuthentication
};

export type AzureActiveDirectoryMsiVmAuthentication = {
  type: 'azure-active-directory-msi-vm',
  options: { clientId: string, msiEndpoint: string }
};

export type AzureActiveDirectoryPasswordAuthentication = {
  type: 'azure-active-directory-password',
  options: { userName: string, password: string }
};

export type AzureActiveDirectoryMsiAppService = {
  type: 'azure-active-directory-msi-app-service',
  options: { msiEndpoint: string, msiSecret: string }
};

export type AzureActiveDirectoryAccessToken = {
  type: 'azure-active-directory-access-token',
  options: {}
};

export type NtlmAuthentication = {
  type: 'ntlm',
  options: { userName: string, password: string, domain: string }
};

declare class Connection {
  STATE: {
    CONNECTING: ConnectingState,
    SENT_PRELOGIN: SentPreloginState,
    REROUTING: ReRoutingState,
    TRANSIENT_FAILURE_RETRY: TransientFailureRetryState,
    SENT_TLSSSLNEGOTIATION: SentTLSSSLNegotiationState,
    SENT_LOGIN7_WITH_STANDARD_LOGIN: SentLogin7WithStandardLoginState,
    SENT_LOGIN7_WITH_NTLM: SentLogin7WithNTLMLoginState,
    SENT_LOGIN7_WITH_FEDAUTH: SentLogin7WithFedauthState,
    LOGGED_IN_SENDING_INITIAL_SQL: LoggedInSendingInitialSqlState,
    LOGGED_IN: LoggedInState,
    BUILDING_CLIENT_REQUEST: BuildingClientRequestState,
    SENT_CLIENT_REQUEST: SentClientRequestState,
    SENT_ATTENTION: SentAttentionState,
    FINAL: FinalState
  }

  debug: Debug;

  secureContext: SecureContext;

  fedAuthRequired: boolean;
  loggedIn: boolean;
  loginError?: ConnectionError;
  inTransaction: boolean;
  isSqlBatch: boolean;
  fedAuthInfoToken: {
    spn: string,
    stsurl: string
  };

  dispatchEvent(event: string, ...args: any[]): void;

  config: InternalConfig;
  ntlmpacket?: any;
  additional: undefined;

  emit(name: string, ...args: any[]): void;
  close(): void;
  initialiseConnection(): void;
  sendPreLogin(): void;
  sendLogin7Packet(): void;
  sendInitialSql(): void;
  sendFedAuthTokenMessage(token: any): void;
  pauseRequest(request: Request | BulkLoad): void;
  resumeRequest(request: Request | BulkLoad): void;

  transitionTo(state: State, ...args: any[]): void;

  sendDataToTokenStreamParser(data: Buffer): boolean;
  createRetryTimer(): void;
  processedInitialSql(): void;
  cleanupConnection(cleanupType: number): void;

  cleanupTypeEnum: {
    NORMAL: number,
    RETRY: number
  };

  curTransientRetryCount: number;

  request?: Request;

  tokenStreamParser: any;
  messageIo: any;
}

export default Connection;
