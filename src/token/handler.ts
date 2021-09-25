import Connection from '../connection';
import Request from '../request';
import { ConnectionError, RequestError } from '../errors';
import { ColumnMetadata } from './colmetadata-token-parser';
import {
  BeginTransactionEnvChangeToken,
  CharsetEnvChangeToken,
  CollationChangeToken,
  ColMetadataToken,
  CommitTransactionEnvChangeToken,
  DatabaseEnvChangeToken,
  DoneInProcToken,
  DoneProcToken,
  DoneToken,
  ErrorMessageToken,
  FeatureExtAckToken,
  FedAuthInfoToken,
  InfoMessageToken,
  LanguageEnvChangeToken,
  LoginAckToken,
  NBCRowToken,
  OrderToken,
  PacketSizeEnvChangeToken,
  ResetConnectionEnvChangeToken,
  ReturnStatusToken,
  ReturnValueToken,
  RollbackTransactionEnvChangeToken,
  RoutingEnvChangeToken,
  RowToken,
  SSPIToken,
  Token
} from './token';

export class UnexpectedTokenError extends Error {
  constructor(handler: TokenHandler, token: Token) {
    super('Unexpected token `' + token.name + '` in `' + handler.constructor.name + '`');
  }
}

export class TokenHandler {
  onInfoMessage(token: InfoMessageToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onErrorMessage(token: ErrorMessageToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onSSPI(token: SSPIToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onDatabaseChange(token: DatabaseEnvChangeToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onLanguageChange(token: LanguageEnvChangeToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onCharsetChange(token: CharsetEnvChangeToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onSqlCollationChange(token: CollationChangeToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onRoutingChange(token: RoutingEnvChangeToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onPacketSizeChange(token: PacketSizeEnvChangeToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onResetConnection(token: ResetConnectionEnvChangeToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onBeginTransaction(token: BeginTransactionEnvChangeToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onCommitTransaction(token: CommitTransactionEnvChangeToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onRollbackTransaction(token: RollbackTransactionEnvChangeToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onFedAuthInfo(token: FedAuthInfoToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onFeatureExtAck(token: FeatureExtAckToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onLoginAck(token: LoginAckToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onColMetadata(token: ColMetadataToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onOrder(token: OrderToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onRow(token: RowToken | NBCRowToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onReturnStatus(token: ReturnStatusToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onReturnValue(token: ReturnValueToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onDoneProc(token: DoneProcToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onDoneInProc(token: DoneInProcToken) {
    throw new UnexpectedTokenError(this, token);
  }

  onDone(token: DoneToken) {
    throw new UnexpectedTokenError(this, token);
  }
}

export class LegacyTokenHandler extends TokenHandler {
  connection: Connection;

  constructor(connection: Connection) {
    super();

    this.connection = connection;
  }

  onInfoMessage(token: InfoMessageToken) {
    this.connection.emit('infoMessage', token);
  }

  onErrorMessage(token: ErrorMessageToken) {
    this.connection.emit('errorMessage', token);

    if (this.connection.loggedIn) {
      const request = this.connection.request;
      if (request) {
        if (!request.canceled) {
          const error = new RequestError(token.message, 'EREQUEST');
          error.number = token.number;
          error.state = token.state;
          error.class = token.class;
          error.serverName = token.serverName;
          error.procName = token.procName;
          error.lineNumber = token.lineNumber;
          request.error = error;
        }
      }
    } else {
      const error = ConnectionError(token.message, 'ELOGIN');

      const isLoginErrorTransient = this.connection.transientErrorLookup.isTransientError(token.number);
      if (isLoginErrorTransient && this.connection.curTransientRetryCount !== this.connection.config.options.maxRetriesOnTransientErrors) {
        error.isTransient = true;
      }

      this.connection.loginError = error;
    }
  }

  onSSPI(token: SSPIToken) {
    if (token.ntlmpacket) {
      this.connection.ntlmpacket = token.ntlmpacket;
      this.connection.ntlmpacketBuffer = token.ntlmpacketBuffer;
    }

    this.connection.emit('sspichallenge', token);
  }

  onDatabaseChange(token: DatabaseEnvChangeToken) {
    this.connection.emit('databaseChange', token.newValue);
  }

  onLanguageChange(token: LanguageEnvChangeToken) {
    this.connection.emit('languageChange', token.newValue);
  }

  onCharsetChange(token: CharsetEnvChangeToken) {
    this.connection.emit('charsetChange', token.newValue);
  }

  onSqlCollationChange(token: CollationChangeToken) {
    this.connection.databaseCollation = token.newValue;
  }

  onFedAuthInfo(token: FedAuthInfoToken) {
    this.connection.dispatchEvent('fedAuthInfo', token);
  }

  onFeatureExtAck(token: FeatureExtAckToken) {
    this.connection.dispatchEvent('featureExtAck', token);
  }

  onLoginAck(token: LoginAckToken) {
    if (!token.tdsVersion) {
      // unsupported TDS version
      this.connection.loginError = ConnectionError('Server responded with unknown TDS version.', 'ETDS');
      this.connection.loggedIn = false;
      return;
    }

    if (!token.interface) {
      // unsupported interface
      this.connection.loginError = ConnectionError('Server responded with unsupported interface.', 'EINTERFACENOTSUPP');
      this.connection.loggedIn = false;
      return;
    }

    // use negotiated version
    this.connection.config.options.tdsVersion = token.tdsVersion;
    this.connection.loggedIn = true;
  }

  onRoutingChange(token: RoutingEnvChangeToken) {
    // Removes instance name attached to the redirect url. E.g., redirect.db.net\instance1 --> redirect.db.net
    const [ server ] = token.newValue.server.split('\\');

    this.connection.routingData = {
      server, port: token.newValue.port
    };
  }

  onPacketSizeChange(token: PacketSizeEnvChangeToken) {
    this.connection.messageIo.packetSize(token.newValue);
  }

  onBeginTransaction(token: BeginTransactionEnvChangeToken) {
    this.connection.transactionDescriptors.push(token.newValue);
    this.connection.inTransaction = true;
  }

  onCommitTransaction(token: CommitTransactionEnvChangeToken) {
    this.connection.transactionDescriptors.length = 1;
    this.connection.inTransaction = false;
  }

  onRollbackTransaction(token: RollbackTransactionEnvChangeToken) {
    this.connection.transactionDescriptors.length = 1;
    // An outermost transaction was rolled back. Reset the transaction counter
    this.connection.inTransaction = false;
    this.connection.emit('rollbackTransaction');
  }

  onColMetadata(token: ColMetadataToken) {
    const request = this.connection.request;
    if (request) {
      if (!request.canceled) {
        if (this.connection.config.options.useColumnNames) {
          const columns: { [key: string]: ColumnMetadata } = Object.create(null);

          for (let j = 0, len = token.columns.length; j < len; j++) {
            const col = token.columns[j];
            if (columns[col.colName] == null) {
              columns[col.colName] = col;
            }
          }

          request.emit('columnMetadata', columns);
        } else {
          request.emit('columnMetadata', token.columns);
        }
      }
    } else {
      this.connection.emit('error', new Error("Received 'columnMetadata' when no sqlRequest is in progress"));
      this.connection.close();
    }
  }

  onOrder(token: OrderToken) {
    const request = this.connection.request;
    if (request) {
      if (!request.canceled) {
        request.emit('order', token.orderColumns);
      }
    } else {
      this.connection.emit('error', new Error("Received 'order' when no sqlRequest is in progress"));
      this.connection.close();
    }
  }

  onRow(token: RowToken | NBCRowToken) {
    const request = this.connection.request as Request;
    if (request) {
      if (!request.canceled) {
        if (this.connection.config.options.rowCollectionOnRequestCompletion) {
          request.rows!.push(token.columns);
        }
        if (this.connection.config.options.rowCollectionOnDone) {
          request.rst!.push(token.columns);
        }
        if (!request.canceled) {
          request.emit('row', token.columns);
        }
      }
    } else {
      this.connection.emit('error', new Error("Received 'row' when no sqlRequest is in progress"));
      this.connection.close();
    }
  }

  onReturnStatus(token: ReturnStatusToken) {
    const request = this.connection.request;
    if (request) {
      if (!request.canceled) {
        // Keep value for passing in 'doneProc' event.
        this.connection.procReturnStatusValue = token.value;
      }
    }
  }

  onReturnValue(token: ReturnValueToken) {
    const request = this.connection.request;
    if (request) {
      if (!request.canceled) {
        request.emit('returnValue', token.paramName, token.value, token.metadata);
      }
    }
  }

  onDoneProc(token: DoneProcToken) {
    const request = this.connection.request as Request;
    if (request) {
      if (!request.canceled) {
        request.emit('doneProc', token.rowCount, token.more, this.connection.procReturnStatusValue, request.rst);
        this.connection.procReturnStatusValue = undefined;
        if (token.rowCount !== undefined) {
          request.rowCount! += token.rowCount;
        }
        if (this.connection.config.options.rowCollectionOnDone) {
          request.rst = [];
        }
      }
    }
  }

  onDoneInProc(token: DoneInProcToken) {
    const request = this.connection.request as Request;
    if (request) {
      if (!request.canceled) {
        request.emit('doneInProc', token.rowCount, token.more, request.rst);
        if (token.rowCount !== undefined) {
          request.rowCount! += token.rowCount;
        }
        if (this.connection.config.options.rowCollectionOnDone) {
          request.rst = [];
        }
      }
    }
  }

  onDone(token: DoneToken) {
    const request = this.connection.request as Request;
    if (request) {
      if (token.attention) {
        this.connection.dispatchEvent('attention');
      }

      if (!request.canceled) {
        if (token.sqlError && !request.error) {
          // check if the DONE_ERROR flags was set, but an ERROR token was not sent.
          request.error = RequestError('An unknown error has occurred.', 'UNKNOWN');
        }
        request.emit('done', token.rowCount, token.more, request.rst);
        if (token.rowCount !== undefined) {
          request.rowCount! += token.rowCount;
        }
        if (this.connection.config.options.rowCollectionOnDone) {
          request.rst = [];
        }
      }
    }
  }

  onResetConnection(token: ResetConnectionEnvChangeToken) {
    this.connection.emit('resetConnection');
  }
}

export class Login7TokenHandler extends TokenHandler {
  connection: Connection;

  constructor(connection: Connection) {
    super();

    this.connection = connection;
  }

  onInfoMessage(token: InfoMessageToken) {
    this.connection.emit('infoMessage', token);
  }

  onErrorMessage(token: ErrorMessageToken) {
    this.connection.emit('errorMessage', token);

    const error = ConnectionError(token.message, 'ELOGIN');

    const isLoginErrorTransient = this.connection.transientErrorLookup.isTransientError(token.number);
    if (isLoginErrorTransient && this.connection.curTransientRetryCount !== this.connection.config.options.maxRetriesOnTransientErrors) {
      error.isTransient = true;
    }

    this.connection.loginError = error;
  }

  onSSPI(token: SSPIToken) {
    if (token.ntlmpacket) {
      this.connection.ntlmpacket = token.ntlmpacket;
      this.connection.ntlmpacketBuffer = token.ntlmpacketBuffer;
    }

    this.connection.emit('sspichallenge', token);
  }

  onDatabaseChange(token: DatabaseEnvChangeToken) {
    this.connection.emit('databaseChange', token.newValue);
  }

  onLanguageChange(token: LanguageEnvChangeToken) {
    this.connection.emit('languageChange', token.newValue);
  }

  onCharsetChange(token: CharsetEnvChangeToken) {
    this.connection.emit('charsetChange', token.newValue);
  }

  onSqlCollationChange(token: CollationChangeToken) {
    this.connection.databaseCollation = token.newValue;
  }

  onFedAuthInfo(token: FedAuthInfoToken) {
    this.connection.fedAuthInfoToken = token;
  }

  onFeatureExtAck(token: FeatureExtAckToken) {
    const { authentication } = this.connection.config;

    if (authentication.type === 'azure-active-directory-password' || authentication.type === 'azure-active-directory-access-token' || authentication.type === 'azure-active-directory-msi-vm' || authentication.type === 'azure-active-directory-msi-app-service' || authentication.type === 'azure-active-directory-service-principal-secret') {
      if (token.fedAuth === undefined) {
        this.connection.loginError = ConnectionError('Did not receive Active Directory authentication acknowledgement');
        this.connection.loggedIn = false;
      } else if (token.fedAuth.length !== 0) {
        this.connection.loginError = ConnectionError(`Active Directory authentication acknowledgment for ${authentication.type} authentication method includes extra data`);
        this.connection.loggedIn = false;
      }
    } else if (token.fedAuth === undefined && token.utf8Support === undefined) {
      this.connection.loginError = ConnectionError('Received acknowledgement for unknown feature');
      this.connection.loggedIn = false;
    } else if (token.fedAuth) {
      this.connection.loginError = ConnectionError('Did not request Active Directory authentication, but received the acknowledgment');
      this.connection.loggedIn = false;
    }
  }

  onLoginAck(token: LoginAckToken) {
    if (!token.tdsVersion) {
      // unsupported TDS version
      this.connection.loginError = ConnectionError('Server responded with unknown TDS version.', 'ETDS');
      this.connection.loggedIn = false;
      return;
    }

    if (!token.interface) {
      // unsupported interface
      this.connection.loginError = ConnectionError('Server responded with unsupported interface.', 'EINTERFACENOTSUPP');
      this.connection.loggedIn = false;
      return;
    }

    // use negotiated version
    this.connection.config.options.tdsVersion = token.tdsVersion;
    this.connection.loggedIn = true;
  }

  onRoutingChange(token: RoutingEnvChangeToken) {
    // Removes instance name attached to the redirect url. E.g., redirect.db.net\instance1 --> redirect.db.net
    const [ server ] = token.newValue.server.split('\\');

    this.connection.routingData = {
      server, port: token.newValue.port
    };
  }

  onDone(token: DoneToken) {
    // Do nothing
  }

  onPacketSizeChange(token: PacketSizeEnvChangeToken) {
    this.connection.messageIo.packetSize(token.newValue);
  }
}
