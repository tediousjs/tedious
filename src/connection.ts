import iconv from 'iconv-lite';
import { once } from 'events';

import {
  DefaultAzureCredential,
  ClientSecretCredential,
  ManagedIdentityCredential,
  UsernamePasswordCredential,
} from '@azure/identity';

import { ConnectionError } from './errors';
import { URL } from 'url';

import LiteConnection, {
  type InternalConnectionOptions as LiteInternalConnectionOptions,
  type ConnectionConfiguration as LiteConnectionConfiguration,
  type ConnectionAuthentication as LiteConnectionAuthentication,
  type ConnectionOptions as LiteConnectionOptions,
  type AzureActiveDirectoryPasswordAuthentication,
  type AzureActiveDirectoryMsiVmAuthentication,
  type AzureActiveDirectoryMsiAppServiceAuthentication,
  type AzureActiveDirectoryServicePrincipalSecret,
  type AzureActiveDirectoryDefaultAuthentication,
  type NtlmAuthentication
} from './connection-lite';
import { TYPE } from './packet';
import Message from './message';
import NTLMResponsePayload from './ntlm-payload';
import { Login7TokenHandler } from './token/handler';
import { setCodec } from './conv';

export type InternalConnectionOptions = LiteInternalConnectionOptions;
export type ConnectionConfiguration = LiteConnectionConfiguration;
export type ConnectionAuthentication = LiteConnectionAuthentication;
export type ConnectionOptions = LiteConnectionOptions;

interface State {
  name: string;
  enter?(this: LiteConnection): void;
  exit?(this: LiteConnection, newState: State): void;
  events: {
    socketError?(this: LiteConnection, err: Error): void;
    connectTimeout?(this: LiteConnection): void;
    message?(this: LiteConnection, message: Message): void;
    retry?(this: LiteConnection): void;
    reconnect?(this: LiteConnection): void;
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
  STATE: {
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
  } = {
      ...LiteConnection.prototype.STATE,
      SENT_LOGIN7_WITH_NTLM: {
        name: 'SentLogin7WithNTLMLogin',
        enter: function() {
          (async () => {
            this.transitionTo(this.STATE.FINAL);
            while (true) {
              let message;
              try {
                message = await this.messageIo.readMessage();
              } catch (err: any) {
                return this.socketError(err);
              }

              const handler = new Login7TokenHandler(this);
              const tokenStreamParser = this.createTokenStreamParser(message, handler);

              await once(tokenStreamParser, 'end');

              if (handler.loginAckReceived) {
                if (handler.routingData) {
                  this.routingData = handler.routingData;
                  return this.transitionTo(this.STATE.REROUTING);
                } else {
                  return this.transitionTo(this.STATE.LOGGED_IN_SENDING_INITIAL_SQL);
                }
              } else if (this.ntlmpacket) {
                const authentication = this.config.authentication as NtlmAuthentication;

                const payload = new NTLMResponsePayload({
                  domain: authentication.options.domain,
                  userName: authentication.options.userName,
                  password: authentication.options.password,
                  ntlmpacket: this.ntlmpacket
                });

                this.messageIo.sendMessage(TYPE.NTLMAUTH_PKT, payload.data);
                this.debug.payload(function() {
                  return payload.toString('  ');
                });

                this.ntlmpacket = undefined;
              } else if (this.loginError) {
                if (isTransientError(this.loginError)) {
                  this.debug.log('Initiating retry on transient error');
                  return this.transitionTo(this.STATE.TRANSIENT_FAILURE_RETRY);
                } else {
                  this.emit('connect', this.loginError);
                  return this.transitionTo(this.STATE.FINAL);
                }
              } else {
                this.emit('connect', new ConnectionError('Login failed.', 'ELOGIN'));
                return this.transitionTo(this.STATE.FINAL);
              }
            }

          })().catch((err) => {
            process.nextTick(() => {
              throw err;
            });
          });
        },
        events: {
          socketError: function() {
            this.transitionTo(this.STATE.FINAL);
          },
          connectTimeout: function() {
            this.transitionTo(this.STATE.FINAL);
          }
        }
      },
      SENT_LOGIN7_WITH_FEDAUTH: {
        name: 'SentLogin7Withfedauth',
        enter: function() {
          (async () => {
            let message;
            try {
              message = await this.messageIo.readMessage();
            } catch (err: any) {
              return this.socketError(err);
            }

            const handler = new Login7TokenHandler(this);
            const tokenStreamParser = this.createTokenStreamParser(message, handler);
            await once(tokenStreamParser, 'end');
            if (handler.loginAckReceived) {
              if (handler.routingData) {
                this.routingData = handler.routingData;
                this.transitionTo(this.STATE.REROUTING);
              } else {
                this.transitionTo(this.STATE.LOGGED_IN_SENDING_INITIAL_SQL);
              }

              return;
            }

            const fedAuthInfoToken = handler.fedAuthInfoToken;

            if (fedAuthInfoToken && fedAuthInfoToken.stsurl && fedAuthInfoToken.spn) {
              const authentication = this.config.authentication as AzureActiveDirectoryPasswordAuthentication | AzureActiveDirectoryMsiVmAuthentication | AzureActiveDirectoryMsiAppServiceAuthentication | AzureActiveDirectoryServicePrincipalSecret | AzureActiveDirectoryDefaultAuthentication;
              const tokenScope = new URL('/.default', fedAuthInfoToken.spn).toString();

              let credentials;

              switch (authentication.type) {
                case 'azure-active-directory-password':
                  credentials = new UsernamePasswordCredential(
                    authentication.options.tenantId ?? 'common',
                    authentication.options.clientId,
                    authentication.options.userName,
                    authentication.options.password
                  );
                  break;
                case 'azure-active-directory-msi-vm':
                case 'azure-active-directory-msi-app-service':
                  const msiArgs = authentication.options.clientId ? [authentication.options.clientId, {}] : [{}];
                  credentials = new ManagedIdentityCredential(...msiArgs);
                  break;
                case 'azure-active-directory-default':
                  const args = authentication.options.clientId ? { managedIdentityClientId: authentication.options.clientId } : {};
                  credentials = new DefaultAzureCredential(args);
                  break;
                case 'azure-active-directory-service-principal-secret':
                  credentials = new ClientSecretCredential(
                    authentication.options.tenantId,
                    authentication.options.clientId,
                    authentication.options.clientSecret
                  );
                  break;
              }

              let tokenResponse;
              try {
                tokenResponse = await credentials.getToken(tokenScope);
              } catch (err) {
                this.loginError = new AggregateError(
                  [new ConnectionError('Security token could not be authenticated or authorized.', 'EFEDAUTH'), err]);
                this.emit('connect', this.loginError);
                this.transitionTo(this.STATE.FINAL);
                return;
              }


              const token = tokenResponse.token;
              this.sendFedAuthTokenMessage(token);

            } else if (this.loginError) {
              if (isTransientError(this.loginError)) {
                this.debug.log('Initiating retry on transient error');
                this.transitionTo(this.STATE.TRANSIENT_FAILURE_RETRY);
              } else {
                this.emit('connect', this.loginError);
                this.transitionTo(this.STATE.FINAL);
              }
            } else {
              this.emit('connect', new ConnectionError('Login failed.', 'ELOGIN'));
              this.transitionTo(this.STATE.FINAL);
            }

          })().catch((err) => {
            process.nextTick(() => {
              throw err;
            });
          });
        },
        events: {
          socketError: function() {
            this.transitionTo(this.STATE.FINAL);
          },
          connectTimeout: function() {
            this.transitionTo(this.STATE.FINAL);
          }
        }
      },
    };
}

function isTransientError(error: AggregateError | ConnectionError): boolean {
  if (error instanceof AggregateError) {
    error = error.errors[0];
  }
  return (error instanceof ConnectionError) && !!error.isTransient;
}

export default Connection;
module.exports = Connection;

setCodec(iconv);
