import Request from './request';
import BulkLoad from './bulk-load';
import { Metadata } from './metadata-parser';

export type InternalConnectionOptions = {
  camelCaseColumns: boolean,
  columnNameReplacer?: (colName: string, index: number, metadata: Metadata) => string,
  lowerCaseGuids?: boolean,
  tdsVersion: string,
  useColumnNames: boolean,
  useUTC: boolean,
};

declare class Connection {
  pauseRequest(request: Request | BulkLoad): void;
  resumeRequest(request: Request | BulkLoad): void;
}

export default Connection;
