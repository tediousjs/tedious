import Debug from '../../../src/debug';
import { Parser } from '../../../src/token/token-stream-parser';
import { TYPE, DatabaseEnvChangeToken, type DoneToken } from '../../../src/token/token';
import { type ParserOptions } from '../../../src/token/stream-parser';
import { TokenHandler } from '../../../src/token/handler';
import type Message from '../../../src/message';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { assert } from 'chai';

const options = { tdsVersion: '7_2', useUTC: false } as ParserOptions;

function createDbChangeBuffer() {
  const oldDb = 'old';
  const newDb = 'new';
  const buffer = new WritableTrackingBuffer();

  buffer.writeUInt8(TYPE.ENVCHANGE);
  buffer.writeUInt16LE(0); // Length written later
  buffer.writeUInt8(0x01); // Database
  buffer.writeUInt8(newDb.length);
  buffer.writeString(newDb, 'ucs2');
  buffer.writeUInt8(oldDb.length);
  buffer.writeString(oldDb, 'ucs2');

  const data = buffer.data;
  data.writeUInt16LE(data.length - (1 + 2), 1);

  return data;
}

// Test handler that only handles database change events
class TestDatabaseChangeHandler extends TokenHandler {
  onDatabaseChange(token: DatabaseEnvChangeToken) {
    assert.isDefined(token);
  }
}

describe('Token Stream Parser', () => {
  describe('when an event listener throws', function() {
    let uncaughtExceptionListeners: NodeJS.UncaughtExceptionListener[];
    let unhandledRejectionListeners: NodeJS.UnhandledRejectionListener[];

    // Take over mocha's handlers, to observe how the exception surfaces.
    beforeEach(function() {
      uncaughtExceptionListeners = process.listeners('uncaughtException');
      unhandledRejectionListeners = process.listeners('unhandledRejection');
      process.removeAllListeners('uncaughtException');
      process.removeAllListeners('unhandledRejection');
    });

    afterEach(function() {
      process.removeAllListeners('uncaughtException');
      process.removeAllListeners('unhandledRejection');
      uncaughtExceptionListeners.forEach((listener) => process.on('uncaughtException', listener));
      unhandledRejectionListeners.forEach((listener) => process.on('unhandledRejection', listener));
    });

    function expectUncaughtException(expected: Error, done: Mocha.Done) {
      process.once('uncaughtException', (err) => {
        try {
          assert.strictEqual(err, expected);
          done();
        } catch (assertionError) {
          done(assertionError);
        }
      });

      process.once('unhandledRejection', () => {
        done(new Error('Expected an uncaught exception, not an unhandled rejection'));
      });
    }

    it('raises an exception of an `end` listener as an uncaught exception', function(done) {
      const error = new Error('end listener failed');
      expectUncaughtException(error, done);

      const parser = new Parser([createDbChangeBuffer()] as unknown as Message, new Debug(), new TestDatabaseChangeHandler(), options);
      parser.on('end', () => {
        throw error;
      });
    });

    it('raises an exception of an `error` listener as an uncaught exception', function(done) {
      const error = new Error('error listener failed');
      expectUncaughtException(error, done);

      const parser = new Parser([Buffer.from([0xFF])] as unknown as Message, new Debug(), new TestDatabaseChangeHandler(), options);
      parser.on('error', () => {
        throw error;
      });
    });
  });

  it('should parse envChange token', function(done) {
    const debug = new Debug({ token: true });
    const buffer = createDbChangeBuffer();

    // Cast to Message since tests use a simplified input instead of full Message
    const parser = new Parser([buffer] as unknown as Message, debug, new TestDatabaseChangeHandler(), options);

    parser.on('end', done);
  });

  it('should parse token split across buffers', function(done) {
    const debug = new Debug({ token: true });
    const buffer = createDbChangeBuffer();

    // Cast to Message since tests use a simplified input instead of full Message
    const parser = new Parser([buffer.slice(0, 6), buffer.slice(6)] as unknown as Message, debug, new TestDatabaseChangeHandler(), options);

    parser.on('end', done);
  });

  it('should parse token delivered one byte at a time', function(done) {
    const debug = new Debug({ token: true });
    const buffer = createDbChangeBuffer();

    const chunks = Array.from(buffer, (byte) => Buffer.from([byte]));

    // Cast to Message since tests use a simplified input instead of full Message
    const parser = new Parser(chunks as unknown as Message, debug, new TestDatabaseChangeHandler(), options);

    parser.on('end', done);
  });

  it('should not dispatch tokens while paused', function(done) {
    const debug = new Debug();

    const buffer = new WritableTrackingBuffer();
    for (let i = 0; i < 3; i++) {
      buffer.writeUInt8(TYPE.DONE);
      buffer.writeUInt16LE(0x0010); // status: row count is valid
      buffer.writeUInt16LE(0); // curCmd
      buffer.writeBigUInt64LE(BigInt(i));
    }

    const rowCounts: (number | undefined)[] = [];
    let parser: Parser;

    class TestDoneHandler extends TokenHandler {
      onDone(token: DoneToken) {
        rowCounts.push(token.rowCount);

        if (token.rowCount === 0) {
          parser.pause();

          setTimeout(() => {
            assert.deepEqual(rowCounts, [0]);
            parser.resume();
          }, 10);
        }
      }
    }

    parser = new Parser([buffer.data], debug, new TestDoneHandler(), options);

    parser.on('end', () => {
      assert.deepEqual(rowCounts, [0, 1, 2]);
      done();
    });
  });

  it('should emit an error if the data ends in the middle of a token', function(done) {
    const debug = new Debug();
    const buffer = createDbChangeBuffer();

    const parser = new Parser([buffer.slice(0, 6)], debug, new TestDatabaseChangeHandler(), options);

    parser.on('end', () => {
      done(new Error('expected an error'));
    });

    parser.on('error', (err: Error) => {
      assert.strictEqual(err.message, 'unexpected end of data');
      done();
    });
  });
});
