import { type DataType } from '../data-type';
import { getTemporal, type Temporal } from '../temporal';
import { plainTimeToScaledTicks } from '../temporal-conversion';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const NULL_LENGTH = Buffer.from([0x00]);

// SQL Server `time(n)` is a zoneless time of day. `Temporal.PlainTime` has
// nanosecond resolution, which fully covers all scales (0..7, down to 100ns).
const Time: DataType = {
  id: 0x29,
  type: 'TIMEN',
  name: 'Time',

  declaration: function(parameter) {
    return 'time(' + (this.resolveScale!(parameter)) + ')';
  },

  resolveScale: function(parameter) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else if (parameter.value === null) {
      return 0;
    } else {
      return 7;
    }
  },

  generateTypeInfo(parameter) {
    return Buffer.from([this.id, parameter.scale!]);
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    switch (parameter.scale) {
      case 0:
      case 1:
      case 2:
        return Buffer.from([0x03]);
      case 3:
      case 4:
        return Buffer.from([0x04]);
      case 5:
      case 6:
      case 7:
        return Buffer.from([0x05]);
      default:
        throw new Error('invalid scale');
    }
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    const buffer = new WritableTrackingBuffer(16);
    const value = parameter.value as Temporal.PlainTime;

    const ticks = plainTimeToScaledTicks(value, parameter.scale!);

    switch (parameter.scale) {
      case 0:
      case 1:
      case 2:
        buffer.writeUInt24LE(ticks);
        break;
      case 3:
      case 4:
        buffer.writeUInt32LE(ticks);
        break;
      case 5:
      case 6:
      case 7:
        buffer.writeUInt40LE(ticks);
    }

    yield buffer.data;
  },

  validate: function(value, collation, options): null | Temporal.PlainTime {
    if (value == null) {
      return null;
    }

    const Temporal = getTemporal();

    if (value instanceof Temporal.PlainTime) {
      return value;
    }

    if (value instanceof Temporal.PlainDateTime || value instanceof Temporal.ZonedDateTime) {
      return value.toPlainTime();
    }

    try {
      return Temporal.PlainTime.from(value as any);
    } catch {
      throw new TypeError('Invalid time.');
    }
  }
};


export default Time;
module.exports = Time;
