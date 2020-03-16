import BulkLoad from './bulk-load';
import Connection, { ConnectionConfiguration } from './connection';
import Request from './request';
import { name } from './library';

import { ConnectionError, RequestError } from './errors';

import { typeByName as TYPES } from './data-type';
import { ISOLATION_LEVEL } from './transaction';
import { versions as TDS_VERSION } from './tds-versions';

const library = { name: name };

export function connect(config: ConnectionConfiguration, connectListener?: (err?: Error) => {}) {
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
  TDS_VERSION
};
