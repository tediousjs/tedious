/**
 * Information about the login attempt that an [[AuthenticationProvider]] is
 * asked to create an [[AuthenticationSession]] for.
 */
export interface AuthenticationContext {
  /**
   * The host name (or IP address) of the server that is being logged into.
   *
   * If the connection was re-routed by the server (e.g. by an Azure SQL
   * gateway), this is the host name of the server the connection was
   * re-routed to.
   */
  readonly server: string;

  /**
   * The TCP port of the server that is being logged into.
   */
  readonly port: number;

  /**
   * The name of the SQL Server instance that is being logged into, if one
   * was configured.
   */
  readonly instanceName: string | undefined;

  /**
   * Whether the server indicated in its PRELOGIN response that it requires
   * federated authentication.
   */
  readonly fedAuthRequired: boolean;

  /**
   * Aborted when the login attempt is cancelled, for example because the
   * connection timed out or was closed.
   */
  readonly signal: AbortSignal;
}

interface BaseAuthenticationSession {
  /**
   * Called once the login attempt this session was created for has
   * finished, whether it succeeded or failed.
   *
   * Use this to release any resources that were allocated for the
   * session (e.g. native security context handles).
   */
  close?(): void | Promise<void>;
}

/**
 * Logs into the server using SQL Server authentication, i.e. using a user
 * name and password that are sent as part of the LOGIN7 message.
 */
export interface SqlAuthenticationSession extends BaseAuthenticationSession {
  type: 'sql';

  /**
   * The SQL Server login name.
   */
  userName?: string | undefined;

  /**
   * The password of the SQL Server login.
   */
  password?: string | undefined;
}

/**
 * Logs into the server using integrated authentication (SSPI), e.g. via
 * NTLM, Kerberos or SPNEGO.
 *
 * The `initialToken` is sent to the server as part of the LOGIN7 message.
 * Every time the server responds with a security token of its own,
 * `handleChallenge` is called with that token, and the token it returns is
 * sent back to the server. This repeats until the server either accepts or
 * rejects the login.
 */
export interface SspiAuthenticationSession extends BaseAuthenticationSession {
  type: 'sspi';

  /**
   * The security token to send to the server as part of the LOGIN7 message.
   */
  initialToken: Buffer;

  /**
   * Computes the response to a security token sent by the server.
   *
   * @param token The security token received from the server.
   * @param signal Aborted when the login attempt is cancelled.
   * @returns The security token to send back to the server.
   */
  handleChallenge(token: Buffer, signal: AbortSignal): Buffer | Promise<Buffer>;
}

/**
 * Logs into the server using a federated authentication token (e.g. a
 * Microsoft Entra ID access token) that is already known when the
 * login starts.
 *
 * The token is sent to the server as part of the LOGIN7 message.
 */
export interface SecurityTokenFederatedAuthenticationSession extends BaseAuthenticationSession {
  type: 'federated';
  library: 'security-token';

  /**
   * The access token to log in with.
   */
  token: string;
}

/**
 * Information sent by the server that is needed to acquire a federated
 * authentication token.
 */
export interface FederatedAuthenticationInfo {
  /**
   * The service principal name of the server, e.g.
   * `https://database.windows.net/`.
   *
   * Microsoft Entra ID tokens should be requested for the
   * `new URL('/.default', spn)` scope.
   */
  spn: string;

  /**
   * The URL of the security token service the token should be acquired from.
   */
  stsUrl: string;
}

/**
 * Logs into the server using a federated authentication token (e.g. a
 * Microsoft Entra ID access token) that is acquired after the server
 * has told the client which token service and resource to use.
 */
export interface MsalFederatedAuthenticationSession extends BaseAuthenticationSession {
  type: 'federated';
  library: 'msal';

  /**
   * The authentication workflow that is used to acquire the token.
   *
   * * `password`: The token is acquired using a user name and password.
   * * `integrated`: The token is acquired in any other way.
   */
  workflow: 'password' | 'integrated';

  /**
   * Acquires the token to log in with.
   *
   * @param info Information sent by the server about how to acquire the token.
   * @param signal Aborted when the login attempt is cancelled.
   * @returns The access token to log in with.
   */
  getToken(info: FederatedAuthenticationInfo, signal: AbortSignal): string | Promise<string>;
}

export type FederatedAuthenticationSession = SecurityTokenFederatedAuthenticationSession | MsalFederatedAuthenticationSession;

/**
 * Describes how a single login attempt authenticates against the server.
 */
export type AuthenticationSession = SqlAuthenticationSession | SspiAuthenticationSession | FederatedAuthenticationSession;

/**
 * An authentication provider is a plugin that tells `tedious` how to
 * authenticate against the server.
 *
 * Pass an authentication provider as the `authentication` property of the
 * [[ConnectionConfiguration]] to use it.
 *
 * ```js
 * const connection = new Connection({
 *   server: 'localhost',
 *   authentication: {
 *     async createSession(context) {
 *       return {
 *         type: 'federated',
 *         library: 'msal',
 *         workflow: 'integrated',
 *         async getToken({ spn }, signal) {
 *           return await fetchAccessToken(new URL('/.default', spn).toString(), signal);
 *         }
 *       };
 *     }
 *   }
 * });
 * ```
 */
export interface AuthenticationProvider {
  /**
   * Creates the [[AuthenticationSession]] for a single login attempt.
   *
   * This is called once for every login attempt, including attempts made
   * after a transient error or after the server re-routed the connection.
   *
   * @param context Information about the login attempt.
   */
  createSession(context: AuthenticationContext): AuthenticationSession | Promise<AuthenticationSession>;
}

/**
 * Checks whether the given value looks like an [[AuthenticationProvider]].
 *
 * @private
 */
export function isAuthenticationProvider(value: unknown): value is AuthenticationProvider {
  return typeof value === 'object' && value !== null && typeof (value as AuthenticationProvider).createSession === 'function';
}

/**
 * Checks that the given value is a valid [[AuthenticationSession]], throwing
 * a `TypeError` if it is not.
 *
 * @private
 */
export function assertValidAuthenticationSession(session: unknown): asserts session is AuthenticationSession {
  if (typeof session !== 'object' || session === null) {
    throw new TypeError('The authentication session must be of type object.');
  }

  const { type, close } = session as AuthenticationSession;

  if (close !== undefined && typeof close !== 'function') {
    throw new TypeError('The "close" property of the authentication session must be of type function.');
  }

  switch (type) {
    case 'sql': {
      const { userName, password } = session as SqlAuthenticationSession;

      if (userName !== undefined && typeof userName !== 'string') {
        throw new TypeError('The "userName" property of the authentication session must be of type string.');
      }

      if (password !== undefined && typeof password !== 'string') {
        throw new TypeError('The "password" property of the authentication session must be of type string.');
      }

      return;
    }

    case 'sspi': {
      const { initialToken, handleChallenge } = session as SspiAuthenticationSession;

      if (!Buffer.isBuffer(initialToken)) {
        throw new TypeError('The "initialToken" property of the authentication session must be of type Buffer.');
      }

      if (typeof handleChallenge !== 'function') {
        throw new TypeError('The "handleChallenge" property of the authentication session must be of type function.');
      }

      return;
    }

    case 'federated': {
      const { library } = session as FederatedAuthenticationSession;

      if (library === 'security-token') {
        if (typeof (session as SecurityTokenFederatedAuthenticationSession).token !== 'string') {
          throw new TypeError('The "token" property of the authentication session must be of type string.');
        }

        return;
      }

      if (library === 'msal') {
        const { workflow, getToken } = session as MsalFederatedAuthenticationSession;

        if (workflow !== 'password' && workflow !== 'integrated') {
          throw new TypeError('The "workflow" property of the authentication session must be one of "password" or "integrated".');
        }

        if (typeof getToken !== 'function') {
          throw new TypeError('The "getToken" property of the authentication session must be of type function.');
        }

        return;
      }

      throw new TypeError('The "library" property of the authentication session must be one of "security-token" or "msal".');
    }

    default:
      throw new TypeError('The "type" property of the authentication session must be one of "sql", "sspi" or "federated".');
  }
}
