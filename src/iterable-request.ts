// This module implements an iterable `Request` class.

import Request, { type RequestOptions } from './request';
import { type ColumnMetadata } from './token/colmetadata-token-parser';

export interface ColumnValue {
  metadata: ColumnMetadata;
  value: any;
}

type RowData = ColumnValue[] | Record<string, ColumnValue>;                    // type variant depending on config.options.useColumnNames
type ColumnMetadataDef = ColumnMetadata[] | Record<string, ColumnMetadata>;    // type variant depending on config.options.useColumnNames

export interface IterableRequestOptions extends RequestOptions {
  iteratorFifoSize: number;
}

/**
* The item object of the request iterator.
*/
export interface IterableRequestItem {

  /**
  * Row data.
  */
  row: RowData;

  /**
  * Result set number, 1..n.
  */
  resultSetNo: number;

  /**
  * Metadata of all columns.
  */
  columnMetadata: ColumnMetadataDef;
}

type iteratorPromiseResolveFunction = (value: IteratorResult<IterableRequestItem>) => void;
type iteratorPromiseRejectFunction = (error: Error) => void;

// Internal class for the state controller logic of the iterator.
class IterableRequestController {

  private request: Request;
  private requestCompleted: boolean;
  private requestPaused: boolean;
  private error: Error | undefined;
  private terminating: boolean;

  private resultSetNo: number;
  private columnMetadata: ColumnMetadataDef | undefined;
  private fifo: IterableRequestItem[];
  private fifoPauseLevel: number;
  private fifoResumeLevel: number;

  private promisePending: boolean;
  private resolvePromise: iteratorPromiseResolveFunction | undefined;
  private rejectPromise: iteratorPromiseRejectFunction | undefined;
  private terminatorResolve: (() => void) | undefined;

  // --- Constructor / Terminator ----------------------------------------------

  constructor(request: Request, options?: IterableRequestOptions) {
    this.request = request;
    this.requestCompleted = false;
    this.requestPaused = false;
    this.terminating = false;

    this.resultSetNo = 0;
    this.fifo = [];
    const fifoSize = options?.iteratorFifoSize ?? 1024;
    this.fifoPauseLevel = fifoSize;
    this.fifoResumeLevel = Math.floor(fifoSize / 2);

    this.promisePending = false;

    request.addListener('row', this.rowEventHandler);
    request.addListener('columnMetadata', this.columnMetadataEventHandler);
  }

  public terminate(): Promise<void> {
    this.terminating = true;
    this.request.resume();                                 // (just to be sure)
    if (this.requestCompleted || !this.request.connection) {
      return Promise.resolve();
    }
    this.request.connection.cancel();
    return new Promise<void>((resolve: () => void) => {
      this.terminatorResolve = resolve;
    });
  }

  // --- Promise logic ---------------------------------------------------------

  private serveError(): boolean {
    if (!this.error || !this.promisePending) {
      return false;
    }
    this.rejectPromise!(this.error);
    this.promisePending = false;
    return true;
  }

  private serveRowItem(): boolean {
    if (!this.fifo.length || !this.promisePending) {
      return false;
    }
    const item = this.fifo.shift()!;
    this.resolvePromise!({ value: item });
    this.promisePending = false;
    if (this.fifo.length <= this.fifoResumeLevel && this.requestPaused) {
      this.request.resume();
      this.requestPaused = false;
    }
    return true;
  }

  private serveRequestCompletion(): boolean {
    if (!this.requestCompleted || !this.promisePending) {
      return false;
    }
    this.resolvePromise!({ done: true, value: undefined });
    this.promisePending = false;
    return true;
  }

  private servePromise() {
    if (this.serveError()) {
      return;
    }
    if (this.serveRowItem()) {
      return;
    }
    if (this.serveRequestCompletion()) {
      return;                                              // eslint-disable-line no-useless-return
    }
  }

  // This promise executor is called synchronously from within Iterator.next().
  public promiseExecutor = (resolve: iteratorPromiseResolveFunction, reject: iteratorPromiseRejectFunction) => {
    if (this.promisePending) {
      throw new Error('Previous promise is still active.');
    }
    this.resolvePromise = resolve;
    this.rejectPromise = reject;
    this.promisePending = true;
    this.servePromise();
  };

  // --- Event handlers --------------------------------------------------------

  public completionCallback(error: Error | null | undefined) {
    this.requestCompleted = true;
    if (this.terminating) {
      if (this.terminatorResolve) {
        this.terminatorResolve();
      }
      return;
    }
    if (error && !this.error) {
      this.error = error;
    }
    this.servePromise();
  }

  private columnMetadataEventHandler = (columnMetadata: ColumnMetadata[] | Record<string, ColumnMetadata>) => {
    this.resultSetNo++;
    this.columnMetadata = columnMetadata;
  };

  private rowEventHandler = (row: RowData) => {
    if (this.requestCompleted || this.error || this.terminating) {
      return;
    }
    if (this.resultSetNo === 0 || !this.columnMetadata) {
      this.error = new Error('No columnMetadata event received before row event.');
      this.servePromise();
      return;
    }
    const item: IterableRequestItem = { row, resultSetNo: this.resultSetNo, columnMetadata: this.columnMetadata };
    this.fifo.push(item);
    if (this.fifo.length >= this.fifoPauseLevel && !this.requestPaused) {
      this.request.pause();
      this.requestPaused = true;
    }
    this.servePromise();
  };

}

// Internal class for the iterator object which is passed to the API client.
class IterableRequestIterator implements AsyncIterator<IterableRequestItem> {

  private controller: IterableRequestController;

  constructor(controller: IterableRequestController) {
    this.controller = controller;
  }

  public next(): Promise<IteratorResult<IterableRequestItem>> {
    return new Promise<IteratorResult<IterableRequestItem>>(this.controller.promiseExecutor);
  }

  public async return(value?: any): Promise<any> {
    await this.controller.terminate();
    return Promise.resolve({ value, done: true });         // eslint-disable-line @typescript-eslint/return-await
  }

  public async throw(_exception?: any): Promise<any> {
    await this.controller.terminate();
    return Promise.resolve({ done: true });                // eslint-disable-line @typescript-eslint/return-await
  }

}

/**
* An iterable `Request` class.
*
* This iterable version is a super class of the normal `Request` class.
*
* Usage:
* ```js
* const request = new IterableRequest("select 42, 'hello world'");
* connection.execSql(request);
* for await (const item of request) {
*   console.log(item.row);
* }
* ```
*/
class IterableRequest extends Request implements AsyncIterable<IterableRequestItem> {

  private iterator: IterableRequestIterator;

  constructor(sqlTextOrProcedure: string | undefined, options?: IterableRequestOptions) {
    super(sqlTextOrProcedure, completionCallback, options);
    const controller = new IterableRequestController(this, options);
    this.iterator = new IterableRequestIterator(controller);

    function completionCallback(error: Error | null | undefined) {
      if (controller) {
        controller.completionCallback(error);
      }
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<IterableRequestItem> {
    return this.iterator;
  }

}

export default IterableRequest;
module.exports = IterableRequest;
