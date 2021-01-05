import iconv from 'iconv-lite';

import {
  loginWithVmMSI,
  loginWithAppServiceMSI,
  UserTokenCredentials,
  MSIVmTokenCredentials,
  MSIAppServiceTokenCredentials,
  ApplicationTokenCredentials
} from '@azure/ms-rest-nodeauth';

import { ConnectionError } from './errors';
import { FedAuthInfoToken, FeatureExtAckToken } from './token/token';

import LiteConnection, {
  InternalConnectionOptions as LiteInternalConnectionOptions,
  ConnectionConfiguration as LiteConnectionConfiguration,
  AzureActiveDirectoryPasswordAuthentication,
  AzureActiveDirectoryMsiVmAuthentication,
  AzureActiveDirectoryMsiAppServiceAuthentication,
  AzureActiveDirectoryServicePrincipalSecret } from './connection-lite';
import { MemoryCache } from 'adal-node';
import { setDecoder } from './decoder';

export type InternalConnectionOptions = LiteInternalConnectionOptions;
export type ConnectionConfiguration = LiteConnectionConfiguration;

interface State {
  name: string;
  enter?(this: LiteConnection): void;
  exit?(this: LiteConnection, newState: State): void;
  events: {
    socketError?(this: LiteConnection, err: Error): void;
    connectTimeout?(this: LiteConnection): void;
    socketConnect?(this: LiteConnection): void;
    data?(this: LiteConnection, data: Buffer): void;
    message?(this: LiteConnection): void;
    retry?(this: LiteConnection): void;
    routingChange?(this: LiteConnection): void;
    reconnect?(this: LiteConnection): void;
    featureExtAck?(this: LiteConnection, token: FeatureExtAckToken): void;
    fedAuthInfo?(this: LiteConnection, token: FedAuthInfoToken): void;
    endOfMessageMarkerReceived?(this: LiteConnection): void;
    loginFailed?(this: LiteConnection): void;
    attention?(this: LiteConnection): void;
  };
}

/**
 * A [[Connection]] instance represents a single connection to a database server.
 *
 * ```js
 * var Connection = require('tedious').Connection;
 * var config = {
 *  "authentication": {
 *    ...,
 *    "options": {...}
 *  },
 *  "options": {...}
 * };
 * var connection = new Connection(config);
 * ```
 *
 * Only one request at a time may be executed on a connection. Once a [[Request]]
 * has been initiated (with [[Connection.callProcedure]], [[Connection.execSql]],
 * or [[Connection.execSqlBatch]]), another should not be initiated until the
 * [[Request]]'s completion callback is called.
 */
class Connection extends LiteConnection {
  /**
   * @private
   */
  STATE!: {
    INITIALIZED: State;
    CONNECTING: State;
    SENT_PRELOGIN: State;
    REROUTING: State;
    TRANSIENT_FAILURE_RETRY: State;
    SENT_TLSSSLNEGOTIATION: State;
    SENT_LOGIN7_WITH_STANDARD_LOGIN: State;
    SENT_LOGIN7_WITH_NTLM: State;
    SENT_LOGIN7_WITH_FEDAUTH: State;
    LOGGED_IN_SENDING_INITIAL_SQL: State;
    LOGGED_IN: State;
    SENT_CLIENT_REQUEST: State;
    SENT_ATTENTION: State;
    FINAL: State;
  }
}

export default Connection;
module.exports = Connection;

setDecoder(iconv.decode);

const authenticationCache = new MemoryCache();

Connection.prototype.STATE = {
  ...LiteConnection.prototype.STATE,
  SENT_LOGIN7_WITH_FEDAUTH: {
    name: 'SentLogin7Withfedauth',
    events: {
      socketError: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      connectTimeout: function() {
        this.transitionTo(this.STATE.FINAL);
      },
      data: function(data) {
        this.sendDataToTokenStreamParser(data);
      },
      routingChange: function() {
        this.transitionTo(this.STATE.REROUTING);
      },
      fedAuthInfo: function(token) {
        this.fedAuthInfoToken = token;
      },
      message: function() {
        const fedAuthInfoToken = this.fedAuthInfoToken;

        if (fedAuthInfoToken && fedAuthInfoToken.stsurl && fedAuthInfoToken.spn) {
          const authentication = this.config.authentication as AzureActiveDirectoryPasswordAuthentication | AzureActiveDirectoryMsiVmAuthentication | AzureActiveDirectoryMsiAppServiceAuthentication | AzureActiveDirectoryServicePrincipalSecret;

          const getToken = (callback: (error: Error | null, token?: string) => void) => {
            const getTokenFromCredentials = (err: Error | undefined, credentials?: UserTokenCredentials | MSIAppServiceTokenCredentials | MSIVmTokenCredentials | ApplicationTokenCredentials) => {
              if (err) {
                return callback(err);
              }

              credentials!.getToken().then((tokenResponse: { accessToken: string | undefined }) => {
                callback(null, tokenResponse.accessToken);
              }, callback);
            };

            if (authentication.type === 'azure-active-directory-password') {
              const credentials = new UserTokenCredentials(
                '7f98cb04-cd1e-40df-9140-3bf7e2cea4db',
                authentication.options.domain ?? 'common',
                authentication.options.userName,
                authentication.options.password,
                fedAuthInfoToken.spn,
                undefined, // environment
                authenticationCache
              );

              getTokenFromCredentials(undefined, credentials);
            } else if (authentication.type === 'azure-active-directory-msi-vm') {
              loginWithVmMSI({
                clientId: authentication.options.clientId,
                msiEndpoint: authentication.options.msiEndpoint,
                resource: fedAuthInfoToken.spn
              }, getTokenFromCredentials);
            } else if (authentication.type === 'azure-active-directory-msi-app-service') {
              loginWithAppServiceMSI({
                msiEndpoint: authentication.options.msiEndpoint,
                msiSecret: authentication.options.msiSecret,
                resource: fedAuthInfoToken.spn,
                clientId: authentication.options.clientId
              }, getTokenFromCredentials);
            } else if (authentication.type === 'azure-active-directory-service-principal-secret') {
              const credentials = new ApplicationTokenCredentials(
                authentication.options.clientId,
                authentication.options.tenantId, // domain
                authentication.options.clientSecret,
                fedAuthInfoToken.spn,
                undefined, // environment
                authenticationCache
              );

              getTokenFromCredentials(undefined, credentials);
            }
          };

          getToken((err, token) => {
            if (err) {
              this.loginError = ConnectionError('Security token could not be authenticated or authorized.', 'EFEDAUTH');
              this.emit('connect', this.loginError);
              this.transitionTo(this.STATE.FINAL);
              return;
            }

            this.sendFedAuthTokenMessage(token!);
          });
        } else if (this.loginError) {
          if (this.loginError.isTransient) {
            this.debug.log('Initiating retry on transient error');
            this.transitionTo(this.STATE.TRANSIENT_FAILURE_RETRY);
          } else {
            this.emit('connect', this.loginError);
            this.transitionTo(this.STATE.FINAL);
          }
        } else {
          this.emit('connect', ConnectionError('Login failed.', 'ELOGIN'));
          this.transitionTo(this.STATE.FINAL);
        }
      }
    }
  },
};
