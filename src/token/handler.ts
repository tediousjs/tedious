import Connection from '../connection';
import Request from '../request';
import { ConnectionError, RequestError } from '../errors';
import { type ColumnMetadata } from './colmetadata-token-parser';
import {
  BeginTransactionEnvChangeToken,
  CharsetEnvChangeToken,
  CollationChangeToken,
  ColMetadataToken,
  CommitTransactionEnvChangeToken,
  DatabaseEnvChangeToken,
  DatabaseMirroringPartnerEnvChangeToken,
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
import BulkLoad from '../bulk-load';

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

  onDatabaseMirroringPartner(token: DatabaseMirroringPartnerEnvChangeToken) {
    throw new UnexpectedTokenError(this, token);
  }
}

/**
 * A handler for tokens received in the response message to the initial SQL Batch request
 * that sets up different connection settings.
 */
export class InitialSqlTokenHandler extends TokenHandler {
  declare connection: Connection;

  constructor(connection: Connection) {
    super();

    this.connection = connection;
  }

  onInfoMessage(token: InfoMessageToken) {
    this.connection.emit('infoMessage', token);
  }

  onErrorMessage(token: ErrorMessageToken) {
    this.connection.emit('errorMessage', token);
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
    this.connection.emit('error', new Error("Received 'columnMetadata' when no sqlRequest is in progress"));
    this.connection.close();
  }

  onOrder(token: OrderToken) {
    this.connection.emit('error', new Error("Received 'order' when no sqlRequest is in progress"));
    this.connection.close();
  }

  onRow(token: RowToken | NBCRowToken) {
    this.connection.emit('error', new Error("Received 'row' when no sqlRequest is in progress"));
    this.connection.close();
  }

  onReturnStatus(token: ReturnStatusToken) {
    // Do nothing
  }

  onReturnValue(token: ReturnValueToken) {
    // Do nothing
  }

  onDoneProc(token: DoneProcToken) {
    // Do nothing
  }

  onDoneInProc(token: DoneInProcToken) {
    // Do nothing
  }

  onDone(token: DoneToken) {
    // Do nothing
  }

  onResetConnection(token: ResetConnectionEnvChangeToken) {
    this.connection.emit('resetConnection');
  }
}

/**
 * A handler for tokens received in the response message to a Login7 message.
 */
export class Login7TokenHandler extends TokenHandler {
  declare connection: Connection;

  declare fedAuthInfoToken: FedAuthInfoToken | undefined;
  declare routingData: { server: string, port: number } | undefined;

  declare loginAckReceived: boolean;

  constructor(connection: Connection) {
    super();
    this.loginAckReceived = false;
    this.connection = connection;
  }

  onInfoMessage(token: InfoMessageToken) {
    this.connection.emit('infoMessage', token);
  }

  onErrorMessage(token: ErrorMessageToken) {
    this.connection.emit('errorMessage', token);

    const error = new ConnectionError(token.message, 'ELOGIN');

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
  }

  onDatabaseChange(token: DatabaseEnvChangeToken) {
    this.connection.emit('databaseChange', token.newValue);
  }

  onDatabaseMirroringPartner(token: DatabaseMirroringPartnerEnvChangeToken) {
    this.connection.emit('databaseMirroringPartner', token.newValue);
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
    this.fedAuthInfoToken = token;
  }

  onFeatureExtAck(token: FeatureExtAckToken) {
    const { authentication } = this.connection.config;

    if (authentication.type === 'azure-active-directory-password' || authentication.type === 'azure-active-directory-access-token' || authentication.type === 'azure-active-directory-msi-vm' || authentication.type === 'azure-active-directory-msi-app-service' || authentication.type === 'azure-active-directory-service-principal-secret' || authentication.type === 'azure-active-directory-default') {
      if (token.fedAuth === undefined) {
        this.connection.loginError = new ConnectionError('Did not receive Active Directory authentication acknowledgement');
      } else if (token.fedAuth.length !== 0) {
        this.connection.loginError = new ConnectionError(`Active Directory authentication acknowledgment for ${authentication.type} authentication method includes extra data`);
      }
    } else if (token.fedAuth === undefined && token.utf8Support === undefined) {
      this.connection.loginError = new ConnectionError('Received acknowledgement for unknown feature');
    } else if (token.fedAuth) {
      this.connection.loginError = new ConnectionError('Did not request Active Directory authentication, but received the acknowledgment');
    }
  }

  onLoginAck(token: LoginAckToken) {
    if (!token.tdsVersion) {
      // unsupported TDS version
      this.connection.loginError = new ConnectionError('Server responded with unknown TDS version.', 'ETDS');
      return;
    }

    if (!token.interface) {
      // unsupported interface
      this.connection.loginError = new ConnectionError('Server responded with unsupported interface.', 'EINTERFACENOTSUPP');
      return;
    }

    // use negotiated version
    this.connection.config.options.tdsVersion = token.tdsVersion;

    this.loginAckReceived = true;
  }

  onRoutingChange(token: RoutingEnvChangeToken) {
    // Removes instance name attached to the redirect url. E.g., redirect.db.net\instance1 --> redirect.db.net
    const [ server ] = token.newValue.server.split('\\');

    this.routingData = {
      server, port: token.newValue.port
    };
  }

  onDoneInProc(token: DoneInProcToken) {
    // Do nothing
  }

  onDone(token: DoneToken) {
    // Do nothing
  }

  onPacketSizeChange(token: PacketSizeEnvChangeToken) {
    this.connection.messageIo.packetSize(token.newValue);
  }
}

/**
 * A handler for tokens received in the response message to a RPC Request,
 * a SQL Batch Request, a Bulk Load BCP Request or a Transaction Manager Request.
 */
export class RequestTokenHandler extends TokenHandler {
  declare connection: Connection;
  declare request: Request | BulkLoad;
  declare errors: RequestError[];

  constructor(connection: Connection, request: Request | BulkLoad) {
    super();

    this.connection = connection;
    this.request = request;
    this.errors = [];
  }

  onInfoMessage(token: InfoMessageToken) {
    this.connection.emit('infoMessage', token);
  }

  onErrorMessage(token: ErrorMessageToken) {
    this.connection.emit('errorMessage', token);

    if (!this.request.canceled) {
      const error = new RequestError(token.message, 'EREQUEST');

      error.number = token.number;
      error.state = token.state;
      error.class = token.class;
      error.serverName = token.serverName;
      error.procName = token.procName;
      error.lineNumber = token.lineNumber;
      this.errors.push(error);
      this.request.error = error;
      if (this.request instanceof Request && this.errors.length > 1) {
        this.request.error = new AggregateError(this.errors);
      }
    }
  }

  onDatabaseChange(token: DatabaseEnvChangeToken) {
    this.connection.emit('databaseChange', token.newValue);
  }

  onDatabaseMirroringPartner(token: DatabaseMirroringPartnerEnvChangeToken) {
    this.connection.emit('databaseMirroringPartner', token.newValue);
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
    if (!this.request.canceled) {
      if (this.connection.config.options.useColumnNames) {
        const columns: { [key: string]: ColumnMetadata } = Object.create(null);

        for (let j = 0, len = token.columns.length; j < len; j++) {
          const col = token.columns[j];
          if (columns[col.colName] == null) {
            columns[col.colName] = col;
          }
        }

        this.request.emit('columnMetadata', columns);
      } else {
        this.request.emit('columnMetadata', token.columns);
      }
    }
  }

  onOrder(token: OrderToken) {
    if (!this.request.canceled) {
      this.request.emit('order', token.orderColumns);
    }
  }

  onRow(token: RowToken | NBCRowToken) {
    if (!this.request.canceled) {
      if (this.connection.config.options.rowCollectionOnRequestCompletion) {
        this.request.rows!.push(token.columns);
      }

      if (this.connection.config.options.rowCollectionOnDone) {
        this.request.rst!.push(token.columns);
      }

      this.request.emit('row', token.columns);
    }
  }

  onReturnStatus(token: ReturnStatusToken) {
    if (!this.request.canceled) {
      // Keep value for passing in 'doneProc' event.
      this.connection.procReturnStatusValue = token.value;
    }
  }

  onReturnValue(token: ReturnValueToken) {
    if (!this.request.canceled) {
      this.request.emit('returnValue', token.paramName, token.value, token.metadata);
    }
  }

  onDoneProc(token: DoneProcToken) {
    if (!this.request.canceled) {
      if (token.sqlError && !this.request.error) {
        // check if the DONE_ERROR flags was set, but an ERROR token was not sent.
        this.request.error = new RequestError('An unknown error has occurred.', 'UNKNOWN');
      }

      this.request.emit('doneProc', token.rowCount, token.more, this.connection.procReturnStatusValue, this.request.rst);

      this.connection.procReturnStatusValue = undefined;

      if (token.rowCount !== undefined) {
        this.request.rowCount! += token.rowCount;
      }

      if (this.connection.config.options.rowCollectionOnDone) {
        this.request.rst = [];
      }
    }
  }

  onDoneInProc(token: DoneInProcToken) {
    if (!this.request.canceled) {
      this.request.emit('doneInProc', token.rowCount, token.more, this.request.rst);

      if (token.rowCount !== undefined) {
        this.request.rowCount! += token.rowCount;
      }

      if (this.connection.config.options.rowCollectionOnDone) {
        this.request.rst = [];
      }
    }
  }

  onDone(token: DoneToken) {
    if (!this.request.canceled) {
      if (token.sqlError && !this.request.error) {
        // check if the DONE_ERROR flags was set, but an ERROR token was not sent.
        this.request.error = new RequestError('An unknown error has occurred.', 'UNKNOWN');
      }

      this.request.emit('done', token.rowCount, token.more, this.request.rst);

      if (token.rowCount !== undefined) {
        this.request.rowCount! += token.rowCount;
      }

      if (this.connection.config.options.rowCollectionOnDone) {
        this.request.rst = [];
      }
    }
  }

  onResetConnection(token: ResetConnectionEnvChangeToken) {
    this.connection.emit('resetConnection');
  }
}

/**
 * A handler for the attention acknowledgement message.
 *
 * This message only contains a `DONE` token that acknowledges
 * that the attention message was received by the server.
 */
export class AttentionTokenHandler extends TokenHandler {
  declare connection: Connection;
  declare request: Request | BulkLoad;

  /**
   * Returns whether an attention acknowledgement was received.
   */
  declare attentionReceived: boolean;

  constructor(connection: Connection, request: Request | BulkLoad) {
    super();

    this.connection = connection;
    this.request = request;

    this.attentionReceived = false;
  }

  onDone(token: DoneToken) {
    if (token.attention) {
      this.attentionReceived = true;
    }
  }
}
