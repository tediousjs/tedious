export default class AbortError extends Error {
  code: string;

  constructor() {
    super('The operation was aborted');

    this.code = 'ABORT_ERR';
    this.name = 'AbortError';
  }
}
