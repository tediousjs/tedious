import Request from './request';
import BulkLoad from './bulk-load';
import { Metadata } from './metadata-parser';

export type ConnectionOptions = {
  tdsVersion: string,
  camelCaseColumns: boolean,
  useColumnNames: boolean,
  columnNameReplacer?: (colName: string, index: number, metadata: Metadata) => string
};

declare class Connection {
  pauseRequest(request: Request | BulkLoad): void;
  resumeRequest(request: Request | BulkLoad): void;
}

export default Connection;
