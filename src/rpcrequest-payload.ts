import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from './all-headers';
import Request from './request';
import { Parameter, ParameterData } from './data-type';
import { InternalConnectionOptions } from './connection';
import { encryptWithKey } from './always-encrypted/key-crypto';
import VarBinary from './data-types/varbinary';
import { CryptoMetadata } from './always-encrypted/types';
import { Readable } from 'readable-stream';

// const OPTION = {
//   WITH_RECOMPILE: 0x01,
//   NO_METADATA: 0x02,
//   REUSE_METADATA: 0x04
// };

const STATUS = {
  BY_REF_VALUE: 0x01,
  DEFAULT_VALUE: 0x02,
  ENCRYPTED_VALUE: 0x08,
};

/*
  s2.2.6.5
 */
class RpcRequestPayload implements Iterable<Buffer> {
  request: Request;
  procedure: string | number;

  options: InternalConnectionOptions;
  txnDescriptor: Buffer;

  constructor(request: Request, txnDescriptor: Buffer, options: InternalConnectionOptions) {
    this.request = request;
    this.procedure = this.request.sqlTextOrProcedure!;
    this.options = options;
    this.txnDescriptor = txnDescriptor;
  }

  [Symbol.iterator]() {
    return this.generateData();
  }

  * generateData() {
    const buffer = new WritableTrackingBuffer(500);
    if (this.options.tdsVersion >= '7_2') {
      const outstandingRequestCount = 1;
      writeToTrackingBuffer(buffer, this.txnDescriptor, outstandingRequestCount);
    }

    if (typeof this.procedure === 'string') {
      buffer.writeUsVarchar(this.procedure);
    } else {
      buffer.writeUShort(0xFFFF);
      buffer.writeUShort(this.procedure);
    }

    const optionFlags = 0;
    buffer.writeUInt16LE(optionFlags);
    yield buffer.data;

<<<<<<< HEAD
    this._encryptParameters(this.request.parameters, (parameters: Parameter[]) => {
      const writeNext = (i: number) => {
        if (i >= parameters.length) {
          cb(buffer.data);
          return;
        }

        this._writeParameter(parameters[i], buffer, () => {
          setImmediate(() => {
            writeNext(i + 1);
          });
        });
      };
      writeNext(0);
    });
=======
    const parameters = this.request.parameters;
    for (let i = 0; i < parameters.length; i++) {
      yield* this.generateParameterData(parameters[i], this.options);
    }
>>>>>>> origin-master
  }

  toString(indent = '') {
    return indent + ('RPC Request - ' + this.procedure);
  }

<<<<<<< HEAD
  _writeParameter(parameter: Parameter, buffer: WritableTrackingBuffer, cb: () => void) {
=======
  * generateParameterData(parameter: Parameter, options: any) {
    const buffer = new WritableTrackingBuffer(1 + 2 + Buffer.byteLength(parameter.name, 'ucs-2') + 1);
>>>>>>> origin-master
    buffer.writeBVarchar('@' + parameter.name);

    let statusFlags = 0;
    if (parameter.output) {
      statusFlags |= STATUS.BY_REF_VALUE;
    }
    if (parameter.cryptoMetadata) {
      statusFlags |= STATUS.ENCRYPTED_VALUE;
    }
    buffer.writeUInt8(statusFlags);

<<<<<<< HEAD
    if (parameter.cryptoMetadata) {
      this._writeEncryptedParameter(parameter, buffer, cb);
    } else {
      this._writeParameterData(parameter, buffer, true, cb);
    }
  }

  _writeParameterData(parameter: Parameter, buffer: WritableTrackingBuffer, writeValue: boolean, cb: () => void) {
    const param: ParameterData = {
      value: parameter.value,
      cryptoMetadata: parameter.cryptoMetadata
    };
=======
    yield buffer.data;

    const param: ParameterData = { value: parameter.value };
>>>>>>> origin-master

    const type = parameter.type;

    if ((type.id & 0x30) === 0x20) {
      if (parameter.length) {
        param.length = parameter.length;
      } else if (type.resolveLength) {
        param.length = type.resolveLength(parameter);
      }
    }

    if (parameter.precision) {
      param.precision = parameter.precision;
    } else if (type.resolvePrecision) {
      param.precision = type.resolvePrecision(parameter);
    }

    if (parameter.scale) {
      param.scale = parameter.scale;
    } else if (type.resolveScale) {
      param.scale = type.resolveScale(parameter);
    }

<<<<<<< HEAD
    if (parameter.collation) {
      param.collation = parameter.collation;
    }

    type.writeTypeInfo(buffer, param, this.options);
    if (writeValue) {
      type.writeParameterData(buffer, param, this.options, () => {
        cb();
      });
    } else {
      cb();
    }
  }

  _writeEncryptedParameter(parameter: Parameter, buffer: WritableTrackingBuffer, cb: () => void) {
    const encryptedParam = {
      value: parameter.encryptedVal,
      type: VarBinary,
      output: parameter.output,
      name: parameter.name,
      forceEncrypt: parameter.forceEncrypt
    };

    this._writeParameterData(encryptedParam, buffer, true, () => {
      this._writeParameterData(parameter, buffer, false, () => {
        this._writeEncryptionMetadata(parameter.cryptoMetadata, buffer, () => {
          cb();
        });
      });
    });
=======
    yield type.generateTypeInfo(param, this.options);
    yield* type.generateParameterData(param, options);
>>>>>>> origin-master
  }

  _encryptParameters(parameters: Parameter[], callback: (parameters: Parameter[]) => void) {
    if (this.options.serverSupportsColumnEncryption === true) {
      const promises: Promise<void>[] = [];

      for (let i = 0, len = parameters.length; i < len; i++) {
        const type = parameters[i].type;
        if (parameters[i].cryptoMetadata && parameters[i].value) {
          if (!type.toBuffer) {
            throw new Error(`Column encryption error. Cannot convert type ${type.name} to buffer.`);
          }
          const plainTextBuffer = type.toBuffer(parameters[i], this.options);
          if (plainTextBuffer) {
            promises.push(encryptWithKey(plainTextBuffer, parameters[i].cryptoMetadata as CryptoMetadata, this.options).then((encryptedValue: Buffer) => {
              parameters[i].encryptedVal = encryptedValue;
            }));
          }
        }
      }

      Promise.all(promises).then(() => callback(parameters));
    } else {
      callback(parameters);
    }
  }

  _writeEncryptionMetadata(cryptoMetadata: CryptoMetadata | undefined, buffer: WritableTrackingBuffer, cb: () => void) {
    if (!cryptoMetadata || !cryptoMetadata.cekEntry || !cryptoMetadata.cekEntry.columnEncryptionKeyValues || cryptoMetadata.cekEntry.columnEncryptionKeyValues.length <= 0) {
      throw new Error('Invalid Crypto Metadata in _writeEncryptionMetadata');
    }

    buffer.writeUInt8(cryptoMetadata.cipherAlgorithmId);
    if (cryptoMetadata.cipherAlgorithmId === 0) {
      buffer.writeBVarchar(cryptoMetadata.cipherAlgorithmName || '');
    }

    buffer.writeUInt8(cryptoMetadata.encryptionType);
    buffer.writeUInt32LE(cryptoMetadata.cekEntry.columnEncryptionKeyValues[0].dbId);
    buffer.writeUInt32LE(cryptoMetadata.cekEntry.columnEncryptionKeyValues[0].keyId);
    buffer.writeUInt32LE(cryptoMetadata.cekEntry.columnEncryptionKeyValues[0].keyVersion);
    buffer.writeBuffer(cryptoMetadata.cekEntry.columnEncryptionKeyValues[0].mdVersion);
    buffer.writeUInt8(cryptoMetadata.normalizationRuleVersion[0]);
    cb();
  }
}

export default RpcRequestPayload;
module.exports = RpcRequestPayload;
