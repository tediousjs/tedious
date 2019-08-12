import Request from './request';
import BulkLoad from './bulk-load';

export type ConnectionOptions = {
  tdsVersion: string
};

declare class Connection {
  pauseRequest(request: Request | BulkLoad): void;
  resumeRequest(request: Request | BulkLoad): void;
}

export default Connection;
