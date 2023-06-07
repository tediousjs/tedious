import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from './all-headers';

/*
  s2.2.6.8
 */

export const OPERATION_TYPE = {
  TM_GET_DTC_ADDRESS: 0x00,
  TM_PROPAGATE_XACT: 0x01,
  TM_BEGIN_XACT: 0x05,
  TM_PROMOTE_XACT: 0x06,
  TM_COMMIT_XACT: 0x07,
  TM_ROLLBACK_XACT: 0x08,
  TM_SAVE_XACT: 0x09
};

export const ISOLATION_LEVEL: { [key: string]: number } = {
  NO_CHANGE: 0x00,
  READ_UNCOMMITTED: 0x01,
  READ_COMMITTED: 0x02,
  REPEATABLE_READ: 0x03,
  SERIALIZABLE: 0x04,
  SNAPSHOT: 0x05
};

export const isolationLevelByValue: { [key: number]: string } = {};
for (const name in ISOLATION_LEVEL) {
  const value = ISOLATION_LEVEL[name];
  isolationLevelByValue[value] = name;
}

export function assertValidIsolationLevel(isolationLevel: any, name: string): asserts isolationLevel is 0 | 1 | 2 | 3 | 4 | 5 {
  if (typeof isolationLevel !== 'number') {
    throw new TypeError(`The "${name}" ${name.includes('.') ? 'property' : 'argument'} must be of type number. Received type ${typeof isolationLevel} (${isolationLevel})`);
  }

  if (!Number.isInteger(isolationLevel)) {
    throw new RangeError(`The value of "${name}" is out of range. It must be an integer. Received: ${isolationLevel}`);
  }

  if (!(isolationLevel >= 0 && isolationLevel <= 5)) {
    throw new RangeError(`The value of "${name}" is out of range. It must be >= 0 && <= 5. Received: ${isolationLevel}`);
  }
}

export class Transaction {
  name: string;
  isolationLevel: number;
  outstandingRequestCount: number;

  constructor(name: string, isolationLevel = ISOLATION_LEVEL.NO_CHANGE) {
    this.name = name;
    this.isolationLevel = isolationLevel;
    this.outstandingRequestCount = 1;
  }

  beginPayload(txnDescriptor: Buffer) {
    const buffer = new WritableTrackingBuffer(100, 'ucs2');
    writeToTrackingBuffer(buffer, txnDescriptor, this.outstandingRequestCount);
    buffer.writeUShort(OPERATION_TYPE.TM_BEGIN_XACT);
    buffer.writeUInt8(this.isolationLevel);
    buffer.writeUInt8(this.name.length * 2);
    buffer.writeString(this.name, 'ucs2');

    return {
      *[Symbol.iterator]() {
        yield buffer.data;
      },
      toString: () => {
        return 'Begin Transaction: name=' + this.name + ', isolationLevel=' + isolationLevelByValue[this.isolationLevel];
      }
    };
  }

  commitPayload(txnDescriptor: Buffer) {
    const buffer = new WritableTrackingBuffer(100, 'ascii');
    writeToTrackingBuffer(buffer, txnDescriptor, this.outstandingRequestCount);
    buffer.writeUShort(OPERATION_TYPE.TM_COMMIT_XACT);
    buffer.writeUInt8(this.name.length * 2);
    buffer.writeString(this.name, 'ucs2');
    // No fBeginXact flag, so no new transaction is started.
    buffer.writeUInt8(0);

    return {
      *[Symbol.iterator]() {
        yield buffer.data;
      },
      toString: () => {
        return 'Commit Transaction: name=' + this.name;
      }
    };
  }

  rollbackPayload(txnDescriptor: Buffer) {
    const buffer = new WritableTrackingBuffer(100, 'ascii');
    writeToTrackingBuffer(buffer, txnDescriptor, this.outstandingRequestCount);
    buffer.writeUShort(OPERATION_TYPE.TM_ROLLBACK_XACT);
    buffer.writeUInt8(this.name.length * 2);
    buffer.writeString(this.name, 'ucs2');
    // No fBeginXact flag, so no new transaction is started.
    buffer.writeUInt8(0);

    return {
      *[Symbol.iterator]() {
        yield buffer.data;
      },
      toString: () => {
        return 'Rollback Transaction: name=' + this.name;
      }
    };
  }

  savePayload(txnDescriptor: Buffer) {
    const buffer = new WritableTrackingBuffer(100, 'ascii');
    writeToTrackingBuffer(buffer, txnDescriptor, this.outstandingRequestCount);
    buffer.writeUShort(OPERATION_TYPE.TM_SAVE_XACT);
    buffer.writeUInt8(this.name.length * 2);
    buffer.writeString(this.name, 'ucs2');

    return {
      *[Symbol.iterator]() {
        yield buffer.data;
      },
      toString: () => {
        return 'Save Transaction: name=' + this.name;
      }
    };
  }

  isolationLevelToTSQL() {
    switch (this.isolationLevel) {
      case ISOLATION_LEVEL.READ_UNCOMMITTED:
        return 'READ UNCOMMITTED';
      case ISOLATION_LEVEL.READ_COMMITTED:
        return 'READ COMMITTED';
      case ISOLATION_LEVEL.REPEATABLE_READ:
        return 'REPEATABLE READ';
      case ISOLATION_LEVEL.SERIALIZABLE:
        return 'SERIALIZABLE';
      case ISOLATION_LEVEL.SNAPSHOT:
        return 'SNAPSHOT';
    }
    return '';
  }
}
