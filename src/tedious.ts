import BulkLoad from './bulk-load';
import Connection, { type ConnectionAuthentication, type ConnectionConfiguration, type ConnectionOptions } from './connection';
import Request from './request';
import { name } from './library';

import { ConnectionError, RequestError } from './errors';

import { TYPES } from './data-type';
import { ISOLATION_LEVEL } from './transaction';
import { versions as TDS_VERSION } from './tds-versions';
import {
  CHANNELS,
  type ConnectMessage,
  type LogMessage,
  type PacketMessage,
  type PayloadMessage,
  type RequestMessage,
  type StateChangeMessage,
  type TokenMessage
} from './diagnostics';

const library = { name: name };

export function connect(config: ConnectionConfiguration, connectListener?: (err?: Error) => void) {
  const connection = new Connection(config);
  connection.connect(connectListener);
  return connection;
}

export {
  BulkLoad,
  Connection,
  Request,
  library,
  ConnectionError,
  RequestError,
  TYPES,
  ISOLATION_LEVEL,
  TDS_VERSION,
  CHANNELS
};

export type {
  ConnectionAuthentication,
  ConnectionConfiguration,
  ConnectionOptions,
  ConnectMessage,
  LogMessage,
  PacketMessage,
  PayloadMessage,
  RequestMessage,
  StateChangeMessage,
  TokenMessage
};
