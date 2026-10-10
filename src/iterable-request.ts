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
interface IteratorPromiseFunctions {resolve: iteratorPromiseResolveFunction, reject: iteratorPromiseRejectFunction}

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

  private promises: IteratorPromiseFunctions[];                                // FIFO of resolve/reject function pairs of pending promises
  private terminatorResolve: (() => void) | undefined;
  private terminatorPromise: Promise<void> | undefined;

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

    this.promises = [];

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
    if (!this.terminatorPromise) {
      this.terminatorPromise = new Promise<void>((resolve: () => void) => {
        this.terminatorResolve = resolve;
      });
    }
    return this.terminatorPromise;
  }

  // --- Promise logic ---------------------------------------------------------

  private serveError(): boolean {
    if (!this.error || !this.promises.length) {
      return false;
    }
    const promise = this.promises.shift()!;
    promise.reject(this.error);
    return true;
  }

  private serveRowItem(): boolean {
    if (!this.fifo.length || !this.promises.length) {
      return false;
    }
    const item = this.fifo.shift()!;
    const promise = this.promises.shift()!;
    promise.resolve({ value: item });
    if (this.fifo.length <= this.fifoResumeLevel && this.requestPaused) {
      this.request.resume();
      this.requestPaused = false;
    }
    return true;
  }

  private serveRequestCompletion(): boolean {
    if (!this.requestCompleted || !this.promises.length) {
      return false;
    }
    const promise = this.promises.shift()!;
    promise.resolve({ done: true, value: undefined });
    return true;
  }

  private serveNextPromise(): boolean {
    if (this.serveRowItem()) {
      return true;
    }
    if (this.serveError()) {
      return true;
    }
    if (this.serveRequestCompletion()) {
      return true;
    }
    return false;
  }

  private servePromises() {
    while (true) {
      if (!this.serveNextPromise()) {
        break;
      }
    }
  }

  // This promise executor is called synchronously from within Iterator.next().
  public promiseExecutor = (resolve: iteratorPromiseResolveFunction, reject: iteratorPromiseRejectFunction) => {
    this.promises.push({ resolve, reject });
    this.servePromises();
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
    this.servePromises();
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
      this.servePromises();
      return;
    }
    const item: IterableRequestItem = { row, resultSetNo: this.resultSetNo, columnMetadata: this.columnMetadata };
    this.fifo.push(item);
    if (this.fifo.length >= this.fifoPauseLevel && !this.requestPaused) {
      this.request.pause();
      this.requestPaused = true;
    }
    this.servePromises();
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
    return { value, done: true };
  }

  public async throw(exception?: any): Promise<any> {
    await this.controller.terminate();
    if (exception) {
      throw exception;
    } else {
      return { done: true };
    }
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
