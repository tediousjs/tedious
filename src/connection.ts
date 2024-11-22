import { once } from 'events';

import {
  DefaultAzureCredential,
  ClientSecretCredential,
  ManagedIdentityCredential,
  UsernamePasswordCredential,
} from '@azure/identity';
import { type AccessToken, type TokenCredential, isTokenCredential } from '@azure/core-auth';

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
  type NtlmAuthentication,
  withResolvers,
  type RoutingData,
  type TokenCredentialAuthentication,
} from './connection-lite';
import { TYPE } from './packet';
import Message from './message';
import NTLMResponsePayload from './ntlm-payload';
import { Login7TokenHandler } from './token/handler';
import { createNTLMRequest } from './ntlm';

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
  } = LiteConnection.prototype.STATE;

  constructor(config: ConnectionConfiguration) {
    super(config);

    let authentication: ConnectionAuthentication;
    if (config.authentication !== undefined) {
      if (typeof config.authentication !== 'object' || config.authentication === null) {
        throw new TypeError('The "config.authentication" property must be of type Object.');
      }

      const type = config.authentication.type;
      const options = config.authentication.options === undefined ? {} : config.authentication.options;

      if (typeof type !== 'string') {
        throw new TypeError('The "config.authentication.type" property must be of type string.');
      }

      if (type !== 'default' && type !== 'ntlm' && type !== 'token-credential' && type !== 'azure-active-directory-password' && type !== 'azure-active-directory-access-token' && type !== 'azure-active-directory-msi-vm' && type !== 'azure-active-directory-msi-app-service' && type !== 'azure-active-directory-service-principal-secret' && type !== 'azure-active-directory-default') {
        throw new TypeError('The "type" property must one of "default", "ntlm", "token-credential", "azure-active-directory-password", "azure-active-directory-access-token", "azure-active-directory-default", "azure-active-directory-msi-vm" or "azure-active-directory-msi-app-service" or "azure-active-directory-service-principal-secret".');
      }

      if (typeof options !== 'object' || options === null) {
        throw new TypeError('The "config.authentication.options" property must be of type object.');
      }

      if (type === 'ntlm') {
        if (typeof options.domain !== 'string') {
          throw new TypeError('The "config.authentication.options.domain" property must be of type string.');
        }

        if (options.userName !== undefined && typeof options.userName !== 'string') {
          throw new TypeError('The "config.authentication.options.userName" property must be of type string.');
        }

        if (options.password !== undefined && typeof options.password !== 'string') {
          throw new TypeError('The "config.authentication.options.password" property must be of type string.');
        }

        authentication = {
          type: 'ntlm',
          options: {
            userName: options.userName,
            password: options.password,
            domain: options.domain && options.domain.toUpperCase()
          }
        };
      } else if (type === 'token-credential') {
        if (!isTokenCredential(options.credential)) {
          throw new TypeError('The "config.authentication.options.credential" property must be an instance of the token credential class.');
        }

        authentication = {
          type: 'token-credential',
          options: {
            credential: options.credential
          }
        };
      } else if (type === 'azure-active-directory-password') {
        if (typeof options.clientId !== 'string') {
          throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
        }

        if (options.userName !== undefined && typeof options.userName !== 'string') {
          throw new TypeError('The "config.authentication.options.userName" property must be of type string.');
        }

        if (options.password !== undefined && typeof options.password !== 'string') {
          throw new TypeError('The "config.authentication.options.password" property must be of type string.');
        }

        if (options.tenantId !== undefined && typeof options.tenantId !== 'string') {
          throw new TypeError('The "config.authentication.options.tenantId" property must be of type string.');
        }

        authentication = {
          type: 'azure-active-directory-password',
          options: {
            userName: options.userName,
            password: options.password,
            tenantId: options.tenantId,
            clientId: options.clientId
          }
        };
      } else if (type === 'azure-active-directory-access-token') {
        if (typeof options.token !== 'string') {
          throw new TypeError('The "config.authentication.options.token" property must be of type string.');
        }

        authentication = {
          type: 'azure-active-directory-access-token',
          options: {
            token: options.token
          }
        };
      } else if (type === 'azure-active-directory-msi-vm') {
        if (options.clientId !== undefined && typeof options.clientId !== 'string') {
          throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
        }

        authentication = {
          type: 'azure-active-directory-msi-vm',
          options: {
            clientId: options.clientId
          }
        };
      } else if (type === 'azure-active-directory-default') {
        if (options.clientId !== undefined && typeof options.clientId !== 'string') {
          throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
        }
        authentication = {
          type: 'azure-active-directory-default',
          options: {
            clientId: options.clientId
          }
        };
      } else if (type === 'azure-active-directory-msi-app-service') {
        if (options.clientId !== undefined && typeof options.clientId !== 'string') {
          throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
        }

        authentication = {
          type: 'azure-active-directory-msi-app-service',
          options: {
            clientId: options.clientId
          }
        };
      } else if (type === 'azure-active-directory-service-principal-secret') {
        if (typeof options.clientId !== 'string') {
          throw new TypeError('The "config.authentication.options.clientId" property must be of type string.');
        }

        if (typeof options.clientSecret !== 'string') {
          throw new TypeError('The "config.authentication.options.clientSecret" property must be of type string.');
        }

        if (typeof options.tenantId !== 'string') {
          throw new TypeError('The "config.authentication.options.tenantId" property must be of type string.');
        }

        authentication = {
          type: 'azure-active-directory-service-principal-secret',
          options: {
            clientId: options.clientId,
            clientSecret: options.clientSecret,
            tenantId: options.tenantId
          }
        };
      } else {
        if (options.userName !== undefined && typeof options.userName !== 'string') {
          throw new TypeError('The "config.authentication.options.userName" property must be of type string.');
        }

        if (options.password !== undefined && typeof options.password !== 'string') {
          throw new TypeError('The "config.authentication.options.password" property must be of type string.');
        }

        authentication = {
          type: 'default',
          options: {
            userName: options.userName,
            password: options.password
          }
        };
      }
    } else {
      authentication = {
        type: 'default',
        options: {
          userName: undefined,
          password: undefined
        }
      };
    }
    this.config.authentication = authentication;
  }

  async performLogin(signal: AbortSignal) {
    const { authentication } = this.config;
    switch (authentication.type) {
      case 'token-credential':
      case 'azure-active-directory-password':
      case 'azure-active-directory-msi-vm':
      case 'azure-active-directory-msi-app-service':
      case 'azure-active-directory-service-principal-secret':
      case 'azure-active-directory-default':
        this.transitionTo(this.STATE.SENT_LOGIN7_WITH_FEDAUTH);
        this.routingData = await this.performSentLogin7WithFedAuth(signal);
        break;
      case 'ntlm':
        this.transitionTo(this.STATE.SENT_LOGIN7_WITH_NTLM);
        this.routingData = await this.performSentLogin7WithNTLMLogin(signal);
        break;
      default:
        this.transitionTo(this.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
        this.routingData = await this.performSentLogin7WithStandardLogin(signal);
        break;
    }
  }

  sendLoginPacket() {
    const payload = this.loginPayload();

    const { authentication } = this.config;
    switch (authentication.type) {
      case 'azure-active-directory-password':
        payload.fedAuth = {
          type: 'ADAL',
          echo: this.fedAuthRequired,
          workflow: 'default'
        };
        break;

      case 'azure-active-directory-access-token':
        payload.fedAuth = {
          type: 'SECURITYTOKEN',
          echo: this.fedAuthRequired,
          fedAuthToken: authentication.options.token
        };
        break;

      case 'token-credential':
      case 'azure-active-directory-msi-vm':
      case 'azure-active-directory-default':
      case 'azure-active-directory-msi-app-service':
      case 'azure-active-directory-service-principal-secret':
        payload.fedAuth = {
          type: 'ADAL',
          echo: this.fedAuthRequired,
          workflow: 'integrated'
        };
        break;

      case 'ntlm':
        payload.sspi = createNTLMRequest({ domain: authentication.options.domain });
        break;

      default:
        payload.userName = authentication.options.userName;
        payload.password = authentication.options.password;
    }

    this.routingData = undefined;
    this.messageIo.sendMessage(TYPE.LOGIN7, payload.toBuffer());

    this.debug.payload(function() {
      return payload.toString('  ');
    });
  }

  /**
   * @private
   */
  async performSentLogin7WithNTLMLogin(signal: AbortSignal): Promise<RoutingData | undefined> {
    signal.throwIfAborted();

    const { promise: signalAborted, reject } = withResolvers<never>();

    const onAbort = () => { reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      while (true) {
        const message = await Promise.race([
          this.messageIo.readMessage().catch((err) => {
            throw this.wrapSocketError(err);
          }),
          signalAborted
        ]);

        const handler = new Login7TokenHandler(this);
        const tokenStreamParser = this.createTokenStreamParser(message, handler);
        await Promise.race([
          once(tokenStreamParser, 'end'),
          signalAborted
        ]);

        if (handler.loginAckReceived) {
          return handler.routingData;
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
          throw this.loginError;
        } else {
          throw new ConnectionError('Login failed.', 'ELOGIN');
        }
      }
    } finally {
      this.loginError = undefined;
      signal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * @private
   */
  async performSentLogin7WithFedAuth(signal: AbortSignal): Promise<RoutingData | undefined> {
    signal.throwIfAborted();

    const { promise: signalAborted, reject } = withResolvers<never>();

    const onAbort = () => { reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      const message = await Promise.race([
        this.messageIo.readMessage().catch((err) => {
          throw this.wrapSocketError(err);
        }),
        signalAborted
      ]);

      const handler = new Login7TokenHandler(this);
      const tokenStreamParser = this.createTokenStreamParser(message, handler);
      await Promise.race([
        once(tokenStreamParser, 'end'),
        signalAborted
      ]);

      if (handler.loginAckReceived) {
        return handler.routingData;
      }

      const fedAuthInfoToken = handler.fedAuthInfoToken;

      if (fedAuthInfoToken && fedAuthInfoToken.stsurl && fedAuthInfoToken.spn) {
        /** Federated authentication configation. */
        const authentication = this.config.authentication as TokenCredentialAuthentication | AzureActiveDirectoryPasswordAuthentication | AzureActiveDirectoryMsiVmAuthentication | AzureActiveDirectoryMsiAppServiceAuthentication | AzureActiveDirectoryServicePrincipalSecret | AzureActiveDirectoryDefaultAuthentication;
        /** Permission scope to pass to Entra ID when requesting an authentication token. */
        const tokenScope = new URL('/.default', fedAuthInfoToken.spn).toString();

        /** Instance of the token credential to use to authenticate to the resource. */
        let credentials: TokenCredential;

        switch (authentication.type) {
          case 'token-credential':
            credentials = authentication.options.credential;
            break;
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

        /** Access token retrieved from Entra ID for the configured permission scope(s). */
        let tokenResponse: AccessToken | null;

        try {
          tokenResponse = await Promise.race([
            credentials.getToken(tokenScope),
            signalAborted
          ]);
        } catch (err) {
          signal.throwIfAborted();

          throw new AggregateError(
            [new ConnectionError('Security token could not be authenticated or authorized.', 'EFEDAUTH'), err]);
        }

        // Type guard the token value so that it is never null.
        if (tokenResponse === null) {
          throw new AggregateError(
            [new ConnectionError('Security token could not be authenticated or authorized.', 'EFEDAUTH')]);
        }

        this.sendFedAuthTokenMessage(tokenResponse.token);
        // sent the fedAuth token message, the rest is similar to standard login 7
        this.transitionTo(this.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
        return await this.performSentLogin7WithStandardLogin(signal);
      } else if (this.loginError) {
        throw this.loginError;
      } else {
        throw new ConnectionError('Login failed.', 'ELOGIN');
      }
    } finally {
      this.loginError = undefined;
      signal.removeEventListener('abort', onAbort);
    }
  }
}

export default Connection;
module.exports = Connection;
