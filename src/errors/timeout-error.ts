export default class TimeoutError extends Error {
  code: string;

  constructor() {
    super('The operation was aborted due to timeout');

    this.code = 'TIMEOUT_ERR';
    this.name = 'TimeoutError';
  }
}
