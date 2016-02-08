'use strict';

const stream = require('readable-stream');
const BufferList = require('bl');

class Job {
  constructor(length, execute) {
    this.length = length;
    this.execute = execute;
  }
}

// These jobs are non-dynamic, so we can reuse the job objects.
// This should reduce GC pressure a bit (as less objects will be
// created and garbage collected during stream parsing).
const JOBS = {
  readInt8: new Job(1, function(buffer, offset) {
    return buffer.readInt8(offset);
  }),
  readUInt8: new Job(1, function(buffer, offset) {
    return buffer.readUInt8(offset);
  }),
  readInt16LE: new Job(2, function(buffer, offset) {
    return buffer.readInt16LE(offset);
  }),
  readInt16BE: new Job(2, function(buffer, offset) {
    return buffer.readInt16BE(offset);
  }),
  readUInt16LE: new Job(2, function(buffer, offset) {
    return buffer.readUInt16LE(offset);
  }),
  readUInt16BE: new Job(2, function(buffer, offset) {
    return buffer.readUInt16BE(offset);
  }),
  readInt32LE: new Job(4, function(buffer, offset) {
    return buffer.readInt32LE(offset);
  }),
  readInt32BE: new Job(4, function(buffer, offset) {
    return buffer.readInt32BE(offset);
  }),
  readUInt32LE: new Job(4, function(buffer, offset) {
    return buffer.readUInt32LE(offset);
  }),
  readUInt32BE: new Job(4, function(buffer, offset) {
    return buffer.readUInt32BE(offset);
  }),
  readInt64LE: new Job(8, function(buffer, offset) {
    return Math.pow(2, 32) * buffer.readInt32LE(offset + 4) + (buffer[offset + 4] & 0x80 === 0x80 ? 1 : -1) * buffer.readUInt32LE(offset);
  }),
  readInt64BE: new Job(8, function(buffer, offset) {
    return Math.pow(2, 32) * buffer.readInt32BE(offset) + (buffer[offset] & 0x80 === 0x80 ? 1 : -1) * buffer.readUInt32BE(offset + 4);
  }),
  readUInt64LE: new Job(8, function(buffer, offset) {
    return Math.pow(2, 32) * buffer.readUInt32LE(offset + 4) + buffer.readUInt32LE(offset);
  }),
  readUInt64BE: new Job(8, function(buffer, offset) {
    return Math.pow(2, 32) * buffer.readUInt32BE(offset) + buffer.readUInt32BE(offset + 4);
  }),
  readFloatLE: new Job(4, function(buffer, offset) {
    return buffer.readFloatLE(offset);
  }),
  readFloatBE: new Job(4, function(buffer, offset) {
    return buffer.readFloatBE(offset);
  }),
  readDoubleLE: new Job(8, function(buffer, offset) {
    return buffer.readDoubleLE(offset);
  }),
  readDoubleBE: new Job(8, function(buffer, offset) {
    return buffer.readDoubleBE(offset);
  })
};

class StreamParser extends stream.Transform {
  constructor(options) {
    options = options || {};

    if (options.objectMode === undefined) {
      options.objectMode = true;
    }

    super(options);

    this.buffer = new BufferList();
    this.generator = undefined;
    this.currentStep = undefined;
  }

  parser() {
    throw new Error('Not implemented');
  }

  _transform(input, encoding, done) {
    this.buffer.append(input);

    if (!this.generator) {
      this.generator = this.parser();
      this.currentStep = this.generator.next();
    }

    let offset = 0;
    while (!this.currentStep.done) {
      const job = this.currentStep.value;
      if (!(job instanceof Job)) {
        return done(new Error('invalid job type'));
      }

      const length = job.length;
      if (this.buffer.length - offset < length) {
        break;
      }

      const result = job.execute(this.buffer, offset);
      offset += length;
      this.currentStep = this.generator.next(result);
    }

    this.buffer.consume(offset);

    if (this.currentStep.done) {
      this.push(null);
    }

    done();
  }

  readBuffer(length) {
    return new Job(length, function(buffer, offset) {
      return buffer.slice(offset, offset + length);
    });
  }

  readString(length) {
    return new Job(length, function(buffer, offset) {
      return buffer.toString('utf8', offset, offset + length);
    });
  }

  skip(length) {
    return new Job(length, function() {});
  }
}

module.exports = StreamParser;

Object.keys(JOBS).forEach(function(jobName) {
  return StreamParser.prototype[jobName] = function() {
    return JOBS[jobName];
  };
});
