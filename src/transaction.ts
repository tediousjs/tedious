import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from './all-headers';
import { Readable } from 'readable-stream';

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
      getStream: () => {
        return new Readable({
          read() {
            this.push(buffer.data);
            this.push(null);
          }
        });
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
      getStream: () => {
        return new Readable({
          read() {
            this.push(buffer.data);
            this.push(null);
          }
        });
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
      getStream: () => {
        return new Readable({
          read() {
            this.push(buffer.data);
            this.push(null);
          }
        });
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
      getStream: () => {
        return new Readable({
          read() {
            this.push(buffer.data);
            this.push(null);
          }
        });
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
