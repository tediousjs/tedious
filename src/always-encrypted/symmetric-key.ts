export class SymmetricKey {
  rootKey: Buffer;

  constructor(rootKey: Buffer) {
    if (!rootKey) {
      throw new Error('Column encryption key cannot be null.');
    } else if (0 === rootKey.length) {
      throw new Error('Empty column encryption key specified.');
    }
    this.rootKey = rootKey;
  }

  zeroOutKey() {
    this.rootKey = Buffer.alloc(this.rootKey.length);
  }
}
export default SymmetricKey;
