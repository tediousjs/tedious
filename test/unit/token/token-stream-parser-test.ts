import Debug from '../../../src/debug';
import { Parser } from '../../../src/token/token-stream-parser';
import { TYPE, DatabaseEnvChangeToken } from '../../../src/token/token';
import { type ParserOptions } from '../../../src/token/stream-parser';
import { TokenHandler } from '../../../src/token/handler';
import type Message from '../../../src/message';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { assert } from 'chai';

const options = { tdsVersion: '7_2', useUTC: false } as ParserOptions;

function createDbChangeBuffer() {
  const oldDb = 'old';
  const newDb = 'new';
  const buffer = new WritableTrackingBuffer(50, 'ucs2');

  buffer.writeUInt8(TYPE.ENVCHANGE);
  buffer.writeUInt16LE(0); // Length written later
  buffer.writeUInt8(0x01); // Database
  buffer.writeUInt8(newDb.length);
  buffer.writeString(newDb);
  buffer.writeUInt8(oldDb.length);
  buffer.writeString(oldDb);

  buffer.data.writeUInt16LE(buffer.data.length - (1 + 2), 1);
  // console.log(buffer)

  return buffer.data;
}

// Test handler that only handles database change events
class TestDatabaseChangeHandler extends TokenHandler {
  onDatabaseChange(token: DatabaseEnvChangeToken) {
    assert.isDefined(token);
  }
}

describe('Token Stream Parser', () => {
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

  it('should stop handing over tokens while paused', async function() {
    const buffer = createDbChangeBuffer();
    const handled: string[] = [];

    let parser: Parser;

    class CountingHandler extends TokenHandler {
      onDatabaseChange(token: DatabaseEnvChangeToken) {
        handled.push(token.newValue);

        if (handled.length === 1) {
          parser.pause();
        }
      }
    }

    const ended = new Promise<void>((resolve) => {
      parser = new Parser(
        [buffer, buffer, buffer] as unknown as Message,
        new Debug(),
        new CountingHandler(),
        options
      );
      parser.on('end', resolve);
    });

    // Give the parser plenty of opportunity to run ahead.
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    assert.lengthOf(handled, 1);

    parser!.resume();
    await ended;

    assert.lengthOf(handled, 3);
  });

  it('should emit `error` for an unparseable token stream', async function() {
    const parser = new Parser(
      [Buffer.from([0x99])] as unknown as Message,
      new Debug(),
      new TestDatabaseChangeHandler(),
      options
    );

    const err = await new Promise<Error>((resolve) => {
      parser.on('error', resolve);
      parser.on('end', () => resolve(new Error('unexpectedly ended without an error')));
    });

    assert.match(err.message, /Unknown type: 153/);
  });

  it('should parse token delivered one byte at a time', function(done) {
    const debug = new Debug({ token: true });
    const buffer = createDbChangeBuffer();

    const chunks = Array.from(buffer, (byte) => Buffer.from([byte]));

    // Cast to Message since tests use a simplified input instead of full Message
    const parser = new Parser(chunks as unknown as Message, debug, new TestDatabaseChangeHandler(), options);

    parser.on('end', done);
  });

  it('should yield the event loop while parsing a long token stream', async function() {
    this.timeout(10000);

    // Enough tokens that parsing cannot plausibly finish inside one slice.
    const buffer = createDbChangeBuffer();
    const chunks = new Array(200000).fill(buffer);

    let timerRan = false;
    const parser = new Parser(
      chunks as unknown as Message,
      new Debug(),
      new TestDatabaseChangeHandler(),
      options
    );

    // A macrotask queued before parsing starts. If parsing holds the loop
    // through microtasks alone, this cannot run until parsing has finished.
    const timer = setTimeout(() => { timerRan = true; }, 0);

    await new Promise<void>((resolve) => parser.on('end', resolve));
    clearTimeout(timer);

    assert.isTrue(timerRan, 'parsing starved the event loop');
  });
});
