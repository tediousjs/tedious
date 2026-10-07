/**
 * Information about the login attempt that an [[AuthenticationProvider]] is
 * asked to provide [[Credentials]] for.
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
   * the client to log in with an access token (federated authentication).
   */
  readonly tokenRequired: boolean;

  /**
   * Aborted when the login attempt is cancelled, for example because the
   * connection timed out or was closed.
   */
  readonly signal: AbortSignal;
}

/**
 * Logs into the server using SQL Server authentication, i.e. using a user
 * name and password that are sent as part of the LOGIN7 message.
 */
export interface PasswordCredentials {
  type: 'password';

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
 * A generator that drives an integrated authentication (SSPI) exchange.
 *
 * Each value it yields is a security token that is sent to the server, and
 * each value passed back into it is a security token the server responded
 * with:
 *
 * 1. The first `next()` call (without a value) must yield the token that is
 *    sent as part of the LOGIN7 message.
 * 2. Every time the server responds with a security token while the login is
 *    still in progress, `next(serverToken)` is called, and must yield the
 *    token to send back to the server.
 * 3. Once the server accepts the login, `next(finalToken)` is called one last
 *    time. `finalToken` is the security token the server sent along with its
 *    acceptance (e.g. a Kerberos `AP-REP` for mutual authentication), or
 *    `undefined` if it did not send one. The generator should verify the
 *    token if needed, and then finish. Throwing an error fails the login,
 *    and so does yielding another non-empty token, as the server no longer
 *    expects one.
 *
 * If the login attempt ends at any point (successfully, with an error, or
 * because it was aborted), `return()` is called on the generator. Use a
 * `try { ... } finally { ... }` block to release any resources (e.g. native
 * security context handles).
 */
export type SspiExchange =
  Generator<Buffer, void, Buffer | undefined> |
  AsyncGenerator<Buffer, void, Buffer | undefined>;

/**
 * Logs into the server using integrated authentication (SSPI), e.g. via
 * NTLM, Kerberos or SPNEGO.
 *
 * ```js
 * {
 *   type: 'sspi',
 *   exchange: (async function*() {
 *     const context = securityLibrary.createContext(`MSSQLSvc/${server}:${port}`);
 *     try {
 *       let serverToken = yield await context.step();
 *       while (serverToken !== undefined) {
 *         const token = await context.step(serverToken);
 *         serverToken = yield token;
 *       }
 *     } finally {
 *       context.free();
 *     }
 *   })()
 * }
 * ```
 */
export interface SspiCredentials {
  type: 'sspi';

  /**
   * The generator that drives the security token exchange. See
   * [[SspiExchange]] for details.
   *
   * The generator's body does not run until the exchange starts, so no
   * resources are allocated if the login attempt is aborted before then.
   */
  exchange: SspiExchange;
}

/**
 * Information sent by the server that describes the access token it expects.
 */
export interface AccessTokenRequest {
  /**
   * The resource the access token needs to be issued for, e.g.
   * `https://database.windows.net/`. (This is the `SPN` sent by the server.)
   *
   * Microsoft Entra ID tokens should be requested for the
   * `new URL('/.default', resource)` scope.
   */
  resource: string;

  /**
   * The URL of the authority (security token service) the access token
   * should be acquired from. (This is the `STSURL` sent by the server.)
   */
  authority: string;
}

/**
 * Logs into the server with an access token (e.g. a Microsoft Entra ID
 * access token) that is already known when the login starts.
 *
 * The token is sent to the server as part of the LOGIN7 message.
 */
export interface StaticAccessTokenCredentials {
  type: 'token';

  /**
   * The access token to log in with.
   */
  token: string;

  acquireToken?: never;
  workflow?: never;
}

/**
 * Logs into the server with an access token (e.g. a Microsoft Entra ID
 * access token) that is acquired once the server has described the token
 * it expects.
 */
export interface AcquiredAccessTokenCredentials {
  type: 'token';

  /**
   * Acquires the access token to log in with.
   *
   * @param request Describes the access token the server expects.
   * @param signal Aborted when the login attempt is cancelled.
   * @returns The access token to log in with.
   */
  acquireToken(request: AccessTokenRequest, signal: AbortSignal): string | Promise<string>;

  /**
   * How the access token is acquired. This is only informational for the
   * server.
   *
   * * `password`: The token is acquired using a user name and password.
   * * `integrated`: The token is acquired in any other way.
   *
   * (default: `integrated`)
   */
  workflow?: 'password' | 'integrated' | undefined;

  token?: never;
}

/**
 * Logs into the server with an access token (federated authentication).
 *
 * Either pass the `token` itself, or an `acquireToken` function that is
 * called once the server has described the token it expects.
 */
export type AccessTokenCredentials = StaticAccessTokenCredentials | AcquiredAccessTokenCredentials;

/**
 * Describes how a single login attempt authenticates against the server.
 */
export type Credentials = PasswordCredentials | SspiCredentials | AccessTokenCredentials;

/**
 * An authentication provider tells `tedious` how to authenticate against
 * the server.
 *
 * Pass an authentication provider as the `authentication` property of the
 * [[ConnectionConfiguration]] to use it, or wrap it in an
 * [[AuthenticationPlugin]] to use it from JSON based configurations.
 *
 * ```js
 * const connection = new Connection({
 *   server: 'localhost',
 *   authentication: {
 *     getCredentials(context) {
 *       return {
 *         type: 'token',
 *         async acquireToken({ resource }, signal) {
 *           return await fetchAccessToken(new URL('/.default', resource).toString(), signal);
 *         }
 *       };
 *     }
 *   }
 * });
 * ```
 */
export interface AuthenticationProvider {
  /**
   * Returns the [[Credentials]] to use for a single login attempt.
   *
   * This is called once for every login attempt, including attempts made
   * after a transient error or after the server re-routed the connection.
   *
   * @param context Information about the login attempt.
   */
  getCredentials(context: AuthenticationContext): Credentials | Promise<Credentials>;
}

/**
 * Checks whether the given value looks like an [[AuthenticationProvider]].
 *
 * @private
 */
export function isAuthenticationProvider(value: unknown): value is AuthenticationProvider {
  return typeof value === 'object' && value !== null && typeof (value as AuthenticationProvider).getCredentials === 'function';
}

/**
 * Checks that the given value is valid [[Credentials]], throwing a
 * `TypeError` if it is not.
 *
 * @private
 */
export function assertValidCredentials(credentials: unknown): asserts credentials is Credentials {
  if (typeof credentials !== 'object' || credentials === null) {
    throw new TypeError('The credentials must be of type object.');
  }

  const { type } = credentials as Credentials;

  switch (type) {
    case 'password': {
      const { userName, password } = credentials as PasswordCredentials;

      if (userName !== undefined && typeof userName !== 'string') {
        throw new TypeError('The "userName" property of the credentials must be of type string.');
      }

      if (password !== undefined && typeof password !== 'string') {
        throw new TypeError('The "password" property of the credentials must be of type string.');
      }

      return;
    }

    case 'sspi': {
      const { exchange } = credentials as SspiCredentials;

      if (typeof exchange !== 'object' || exchange === null || typeof exchange.next !== 'function' || typeof exchange.return !== 'function') {
        throw new TypeError('The "exchange" property of the credentials must be a generator.');
      }

      return;
    }

    case 'token': {
      const { token, acquireToken, workflow } = credentials as { token?: unknown, acquireToken?: unknown, workflow?: unknown };

      if ((token === undefined) === (acquireToken === undefined)) {
        throw new TypeError('The credentials must have either a "token" or an "acquireToken" property.');
      }

      if (token !== undefined) {
        if (typeof token !== 'string') {
          throw new TypeError('The "token" property of the credentials must be of type string.');
        }

        if (workflow !== undefined) {
          throw new TypeError('The "workflow" property of the credentials can only be used together with "acquireToken".');
        }

        return;
      }

      if (typeof acquireToken !== 'function') {
        throw new TypeError('The "acquireToken" property of the credentials must be of type function.');
      }

      if (workflow !== undefined && workflow !== 'password' && workflow !== 'integrated') {
        throw new TypeError('The "workflow" property of the credentials must be one of "password" or "integrated".');
      }

      return;
    }

    default:
      throw new TypeError('The "type" property of the credentials must be one of "password", "sspi" or "token".');
  }
}
