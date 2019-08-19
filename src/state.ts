import Connection, { NtlmAuthentication } from './connection';
import PreloginPayload from './prelogin-payload';
import { ConnectionError, RequestError } from './errors';
import NTLMResponsePayload from './ntlm-payload';
import { TYPE } from './packet';

import { loginWithUsernamePassword, loginWithVmMSI, loginWithAppServiceMSI } from '@azure/ms-rest-nodeauth';

export abstract class State {
  connection: Connection;
  name: string;

  constructor(name: string, connection: Connection) {
    this.name = name;
    this.connection = connection;
  }

  enter() { }
  exit(_nextState: State) { }
}

export class ConnectingState extends State {
  constructor(connection: Connection) {
    super('Connecting', connection);
  }

  enter() {
    this.connection.initialiseConnection();
  }

  socketError() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  connectTimeout() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  socketConnect() {
    this.connection.sendPreLogin();
    this.connection.transitionTo(this.connection.STATE.SENT_PRELOGIN);
  }
}

export class SentPreloginState extends State {
  messageBuffer: Buffer;

  constructor(connection: Connection) {
    super('SentPrelogin', connection);

    this.messageBuffer = Buffer.alloc(0);
  }

  exit() {
    this.messageBuffer = Buffer.alloc(0);
  }


  socketError() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  connectTimeout() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  data(data: Buffer) {
    this.messageBuffer = Buffer.concat([this.messageBuffer, data]);
  }

  message() {
    const preloginPayload = new PreloginPayload(this.messageBuffer);

    this.connection.debug.payload(function() {
      return preloginPayload.toString('  ');
    });

    if (preloginPayload.fedAuthRequired === 1) {
      this.connection.fedAuthRequired = true;
    }

    if (preloginPayload.encryptionString === 'ON' || preloginPayload.encryptionString === 'REQ') {
      if (!this.connection.config.options.encrypt) {
        this.connection.emit('connect', new ConnectionError("Server requires encryption, set 'encrypt' config option to true.", 'EENCRYPT'));
        return this.connection.close();
      }

      this.connection.messageIo.startTls(this.connection.secureContext, this.connection.config.server, this.connection.config.options.trustServerCertificate);
      this.connection.transitionTo(this.connection.STATE.SENT_TLSSSLNEGOTIATION);
    } else {
      this.connection.sendLogin7Packet();

      const { authentication } = this.connection.config;
      if (authentication.type === 'ntlm') {
        this.connection.transitionTo(this.connection.STATE.SENT_LOGIN7_WITH_NTLM);
      } else {
        this.connection.transitionTo(this.connection.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
      }
    }
  }
}

export class ReRoutingState extends State {
  constructor(connection: Connection) {
    super('ReRouting', connection);
  }

  message() {}

  socketError() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  connectTimeout() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  reconnect() {
    this.connection.transitionTo(this.connection.STATE.CONNECTING);
  }
}

export class TransientFailureRetryState extends State {
  constructor(connection: Connection) {
    super('TransientFailureRetry', connection);
  }

  enter() {
    this.connection.curTransientRetryCount++;
    this.connection.cleanupConnection(this.connection.cleanupTypeEnum.RETRY);
  }

  message() {}

  socketError() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  connectTimeout() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  retry() {
    this.connection.createRetryTimer();
  }
}

export class SentTLSSSLNegotiationState extends State {
  constructor(connection: Connection) {
    super('SentTLSSSLNegotiation', connection);
  }

  socketError() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  connectTimeout() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  data(data: Buffer) {
    this.connection.messageIo.tlsHandshakeData(data);
  }

  message() {
    if (this.connection.messageIo.tlsNegotiationComplete) {
      this.connection.sendLogin7Packet();

      const { authentication } = this.connection.config;

      if (authentication.type === 'azure-active-directory-password' || authentication.type === 'azure-active-directory-msi-vm' || authentication.type === 'azure-active-directory-msi-app-service') {
        this.connection.transitionTo(this.connection.STATE.SENT_LOGIN7_WITH_FEDAUTH);
      } else if (authentication.type === 'ntlm') {
        this.connection.transitionTo(this.connection.STATE.SENT_LOGIN7_WITH_NTLM);
      } else {
        this.connection.transitionTo(this.connection.STATE.SENT_LOGIN7_WITH_STANDARD_LOGIN);
      }
    }
  }
}

export class SentLogin7WithStandardLoginState extends State {
  constructor(connection: Connection) {
    super('SentLogin7WithStandardLogin', connection);
  }

  socketError() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  connectTimeout() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  data(data: Buffer) {
    this.connection.sendDataToTokenStreamParser(data);
  }

  routingChange() {
    this.connection.transitionTo(this.connection.STATE.REROUTING);
  }

  featureExtAck(token: any) {
    const { authentication } = this.connection.config;
    if (authentication.type === 'azure-active-directory-password' || authentication.type === 'azure-active-directory-access-token' || authentication.type === 'azure-active-directory-msi-vm' || authentication.type === 'azure-active-directory-msi-app-service') {
      if (token.fedAuth === undefined) {
        this.connection.loginError = new ConnectionError('Did not receive Active Directory authentication acknowledgement');
        this.connection.loggedIn = false;
      } else if (token.fedAuth.length !== 0) {
        this.connection.loginError = new ConnectionError(`Active Directory authentication acknowledgment for ${authentication.type} authentication method includes extra data`);
        this.connection.loggedIn = false;
      }
    } else if (token.fedAuth === undefined) {
      this.connection.loginError = new ConnectionError('Received acknowledgement for unknown feature');
      this.connection.loggedIn = false;
    } else {
      this.connection.loginError = new ConnectionError('Did not request Active Directory authentication, but received the acknowledgment');
      this.connection.loggedIn = false;
    }
  }

  message() {
    if (this.connection.loggedIn) {
      this.connection.transitionTo(this.connection.STATE.LOGGED_IN_SENDING_INITIAL_SQL);
    } else if (this.connection.loginError) {
      if (this.connection.loginError.isTransient) {
        this.connection.debug.log('Initiating retry on transient error');
        this.connection.transitionTo(this.connection.STATE.TRANSIENT_FAILURE_RETRY);
      } else {
        this.connection.emit('connect', this.connection.loginError);
        this.connection.transitionTo(this.connection.STATE.FINAL);
      }
    } else {
      this.connection.emit('connect', new ConnectionError('Login failed.', 'ELOGIN'));
      this.connection.transitionTo(this.connection.STATE.FINAL);
    }
  }
}

export class SentLogin7WithNTLMLoginState extends State {
  constructor(connection: Connection) {
    super('SentLogin7WithNTLMLogin', connection);
  }

  socketError() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  connectTimeout() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  data(data: Buffer) {
    this.connection.sendDataToTokenStreamParser(data);
  }

  message() {
    if (this.connection.ntlmpacket) {
      const authentication = this.connection.config.authentication as NtlmAuthentication;

      const payload = new NTLMResponsePayload({
        domain: authentication.options.domain,
        userName: authentication.options.userName,
        password: authentication.options.password,
        ntlmpacket: this.connection.ntlmpacket,
      });

      this.connection.messageIo.sendMessage(TYPE.NTLMAUTH_PKT, payload.data);
      this.connection.debug.payload(function() {
        return payload.toString('  ');
      });

      this.connection.ntlmpacket = undefined;
    } else if (this.connection.loggedIn) {
      this.connection.transitionTo(this.connection.STATE.LOGGED_IN_SENDING_INITIAL_SQL);
    } else if (this.connection.loginError) {
      if (this.connection.loginError.isTransient) {
        this.connection.debug.log('Initiating retry on transient error');
        this.connection.transitionTo(this.connection.STATE.TRANSIENT_FAILURE_RETRY);
      } else {
        this.connection.emit('connect', this.connection.loginError);
        this.connection.transitionTo(this.connection.STATE.FINAL);
      }
    } else {
      this.connection.emit('connect', new ConnectionError('Login failed.', 'ELOGIN'));
      this.connection.transitionTo(this.connection.STATE.FINAL);
    }
  }
}

export class SentLogin7WithFedauthState extends State {
  constructor(connection: Connection) {
    super('SentLogin7WithFedauth', connection);
  }

  socketError() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  connectTimeout() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  data(data: Buffer) {
    this.connection.sendDataToTokenStreamParser(data);
  }

  routingChange() {
    this.connection.transitionTo(this.connection.STATE.REROUTING);
  }

  fedAuthInfo(token: Connection['fedAuthInfoToken']) {
    this.connection.fedAuthInfoToken = token;
  }

  message() {
    if (this.connection.fedAuthInfoToken && this.connection.fedAuthInfoToken.stsurl && this.connection.fedAuthInfoToken.spn) {
      const { authentication } = this.connection.config;

      const getToken = (callback: (err: Error | null, accessToken?: string) => void) => {
        const getTokenFromCredentials = (err: Error | undefined, credentials: any) => {
          if (err) {
            return callback(err);
          }

          credentials.getToken().then((tokenResponse: any) => {
            callback(null, tokenResponse.accessToken);
          }, callback);
        };

        if (authentication.type === 'azure-active-directory-password') {
          loginWithUsernamePassword(authentication.options.userName, authentication.options.password, {
            clientId: '7f98cb04-cd1e-40df-9140-3bf7e2cea4db',
            tokenAudience: this.connection.fedAuthInfoToken.spn
          }, getTokenFromCredentials);
        } else if (authentication.type === 'azure-active-directory-msi-vm') {
          loginWithVmMSI({
            clientId: authentication.options.clientId,
            msiEndpoint: authentication.options.msiEndpoint,
            resource: this.connection.fedAuthInfoToken.spn
          }, getTokenFromCredentials);
        } else if (authentication.type === 'azure-active-directory-msi-app-service') {
          loginWithAppServiceMSI({
            msiEndpoint: authentication.options.msiEndpoint,
            msiSecret: authentication.options.msiSecret,
            resource: this.connection.fedAuthInfoToken.spn
          }, getTokenFromCredentials);
        }
      };

      getToken((err, token) => {
        if (err) {
          this.connection.loginError = new ConnectionError('Security token could not be authenticated or authorized.', 'EFEDAUTH');
          this.connection.emit('connect', this.connection.loginError);
          this.connection.transitionTo(this.connection.STATE.FINAL);
          return;
        }

        this.connection.sendFedAuthTokenMessage(token);
      });
    } else if (this.connection.loginError) {
      if (this.connection.loginError.isTransient) {
        this.connection.debug.log('Initiating retry on transient error');
        this.connection.transitionTo(this.connection.STATE.TRANSIENT_FAILURE_RETRY);
      } else {
        this.connection.emit('connect', this.connection.loginError);
        this.connection.transitionTo(this.connection.STATE.FINAL);
      }
    } else {
      this.connection.emit('connect', new ConnectionError('Login failed.', 'ELOGIN'));
      this.connection.transitionTo(this.connection.STATE.FINAL);
    }
  }
}

export class LoggedInSendingInitialSqlState extends State {
  constructor(connection: Connection) {
    super('LoggedInSendingInitialSql', connection);
  }

  enter() {
    this.connection.sendInitialSql();
  }

  socketError() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  connectTimeout() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }

  data(data: Buffer) {
    this.connection.sendDataToTokenStreamParser(data);
  }

  message() {
    this.connection.transitionTo(this.connection.STATE.LOGGED_IN);
    this.connection.processedInitialSql();
  }
}

export class LoggedInState extends State {
  constructor(connection: Connection) {
    super('LoggedIn', connection);
  }

  socketError() {
    this.connection.transitionTo(this.connection.STATE.FINAL);
  }
}

export class BuildingClientRequestState extends State {
  constructor(connection: Connection) {
    super('BuildingClientRequest', connection);
  }

  socketError(err: Error) {
    const sqlRequest = this.connection.request!;
    this.connection.request = undefined;
    this.connection.transitionTo(this.connection.STATE.FINAL);

    sqlRequest.callback(err);
  }
}

export class SentClientRequestState extends State {
  timer?: NodeJS.Timeout;

  constructor(connection: Connection) {
    super('SentClientRequest', connection);

    this.timer = undefined;
  }

  enter() {
    const request = this.connection.request!;
    const timeout = (request.timeout !== undefined) ? request.timeout : this.connection.config.options.requestTimeout;

    if (timeout) {
      this.timer = setTimeout(() => {
        request.cancel();
        const message = 'Timeout: Request failed to complete in ' + timeout + 'ms';
        request.error = new RequestError(message, 'ETIMEOUT');
      }, timeout);
    }
  }

  exit(nextState: State) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (nextState !== this.connection.STATE.FINAL) {
      this.connection.tokenStreamParser.resume();
    }
  }

  socketError(err: Error) {
    const sqlRequest = this.connection.request!;
    this.connection.request = undefined;
    this.connection.transitionTo(this.connection.STATE.FINAL);

    sqlRequest.callback(err);
  }

  data(data: Buffer) {
    if (this.timer) {
      // request timer is stopped on first data package
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    const ret = this.connection.sendDataToTokenStreamParser(data);
    if (ret === false) {
      // Bridge backpressure from the token stream parser transform to the
      // packet stream transform.
      this.connection.messageIo.pause();
    }
  }

  message() {
    // We have to channel the 'message' (EOM) event through the token stream
    // parser transform, to keep it in line with the flow of the tokens, when
    // the incoming data flow is paused and resumed.
    this.connection.tokenStreamParser.addEndOfMessageMarker();
  }

  endOfMessageMarkerReceived() {
    this.connection.transitionTo(this.connection.STATE.LOGGED_IN);
    const sqlRequest = this.connection.request!;
    this.connection.request = undefined;
    if (this.connection.config.options.tdsVersion < '7_2' && sqlRequest.error && this.connection.isSqlBatch) {
      this.connection.inTransaction = false;
    }
    sqlRequest.callback(sqlRequest.error, sqlRequest.rowCount, sqlRequest.rows);
  }
}

export class SentAttentionState extends State {
  constructor(connection: Connection) {
    super('SentAttention', connection);
  }

  enter() {
    this.connection.attentionReceived = false;
  }

  socketError(err: Error) {
    const sqlRequest = this.connection.request!;
    this.connection.request = undefined;

    this.connection.transitionTo(this.connection.STATE.FINAL);

    sqlRequest.callback(err);
  }

  data(data: Buffer) {
    this.connection.sendDataToTokenStreamParser(data);
  }

  attention() {
    this.connection.attentionReceived = true;
  }

  message() {
    // 3.2.5.7 Sent Attention State
    // Discard any data contained in the response, until we receive the attention response
    if (this.connection.attentionReceived) {
      this.connection.clearCancelTimer();

      const sqlRequest = this.connection.request!;
      this.connection.request = undefined;
      this.connection.transitionTo(this.connection.STATE.LOGGED_IN);

      if (sqlRequest.error && sqlRequest.error instanceof RequestError && sqlRequest.error.code === 'ETIMEOUT') {
        sqlRequest.callback(sqlRequest.error);
      } else {
        sqlRequest.callback(new RequestError('Canceled.', 'ECANCEL'));
      }
    }
  }
}

export class FinalState extends State {
  constructor(connection: Connection) {
    super('Final', connection);
  }

  enter() {
    this.connection.cleanupConnection(this.connection.cleanupTypeEnum.NORMAL);
  }

  connectTimeout() { }
  message() { }
  socketError() { }
}
