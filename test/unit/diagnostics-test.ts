import * as dc from 'node:diagnostics_channel';
import { assert } from 'chai';

import Debug from '../../src/debug';
import { Connection, Request, CHANNELS } from '../../src/tedious';
import { Packet } from '../../src/packet';
import { Token } from '../../src/token/token';

class MockPacket {
  headerToString(): string {
    return 'header';
  }

  dataToString(): string {
    return 'data';
  }
}

describe('diagnostics channels', function() {
  let subscriptions: Array<[string, dc.ChannelListener]>;

  const subscribe = (name: string, onMessage: dc.ChannelListener) => {
    dc.subscribe(name, onMessage);
    subscriptions.push([name, onMessage]);
  };

  beforeEach(function() {
    subscriptions = [];
  });

  afterEach(function() {
    // Channels are process-global - always clean up subscribers so they
    // don't leak into other tests via `channel.hasSubscribers`.
    for (const [name, onMessage] of subscriptions) {
      dc.unsubscribe(name, onMessage);
    }
  });

  describe('tedious:packet:sent / tedious:packet:received', function() {
    it('publishes the packet when a packet is sent', function() {
      const packet = new MockPacket() as Packet;
      const messages: any[] = [];
      subscribe(CHANNELS.packetSent, (message) => { messages.push(message); });

      const debug = new Debug();
      debug.packet('Sent', packet);

      assert.lengthOf(messages, 1);
      assert.strictEqual(messages[0].packet, packet);
      assert.isUndefined(messages[0].connection);
    });

    it('publishes the packet when a packet is received', function() {
      const packet = new MockPacket() as Packet;
      const messages: any[] = [];
      subscribe(CHANNELS.packetReceived, (message) => { messages.push(message); });

      const debug = new Debug();
      debug.packet('Received', packet);

      assert.lengthOf(messages, 1);
      assert.strictEqual(messages[0].packet, packet);
    });

    it('publishes to the channel matching the direction only', function() {
      const messages: any[] = [];
      subscribe(CHANNELS.packetReceived, (message) => { messages.push(message); });

      const debug = new Debug();
      debug.packet('Sent', new MockPacket() as Packet);

      assert.lengthOf(messages, 0);
    });

    it('publishes independently of the legacy debug options and listeners', function() {
      const messages: any[] = [];
      const legacyMessages: string[] = [];
      subscribe(CHANNELS.packetSent, (message) => { messages.push(message); });

      // `packet` option disabled - the legacy path stays silent, the channel
      // still receives the packet.
      const debug = new Debug({ packet: false });
      debug.on('debug', (text) => { legacyMessages.push(text); });
      debug.packet('Sent', new MockPacket() as Packet);

      assert.lengthOf(messages, 1);
      assert.lengthOf(legacyMessages, 0);
    });

    it('includes the connection the debug instance belongs to', function() {
      const connection = {} as Connection;
      const messages: any[] = [];
      subscribe(CHANNELS.packetSent, (message) => { messages.push(message); });

      const debug = new Debug({}, connection);
      debug.packet('Sent', new MockPacket() as Packet);

      assert.lengthOf(messages, 1);
      assert.strictEqual(messages[0].connection, connection);
    });
  });

  describe('tedious:payload:sent / tedious:payload:received', function() {
    it('publishes the payload object without invoking the text thunk', function() {
      const payload = { toString: () => 'payload' };
      const messages: any[] = [];
      let thunkCalled = false;
      subscribe(CHANNELS.payloadSent, (message) => { messages.push(message); });

      const debug = new Debug();
      debug.payload(() => {
        thunkCalled = true;
        return 'payload';
      }, payload);

      assert.lengthOf(messages, 1);
      assert.strictEqual(messages[0].payload, payload);
      assert.isFalse(thunkCalled, 'payload text should only be generated for the legacy debug path');
    });

    it('publishes received payloads on the received channel', function() {
      const payload = { toString: () => 'payload' };
      const sentMessages: any[] = [];
      const receivedMessages: any[] = [];
      subscribe(CHANNELS.payloadSent, (message) => { sentMessages.push(message); });
      subscribe(CHANNELS.payloadReceived, (message) => { receivedMessages.push(message); });

      const debug = new Debug();
      debug.payload(() => 'payload', payload, 'Received');

      assert.lengthOf(sentMessages, 0);
      assert.lengthOf(receivedMessages, 1);
      assert.strictEqual(receivedMessages[0].payload, payload);
    });

    it('does not publish when no payload object is given', function() {
      const messages: any[] = [];
      subscribe(CHANNELS.payloadSent, (message) => { messages.push(message); });

      const debug = new Debug();
      debug.payload(() => 'payload');

      assert.lengthOf(messages, 0);
    });

    it('still emits legacy debug events alongside the channel', function(done) {
      const payload = { toString: () => 'payload' };
      const messages: any[] = [];
      subscribe(CHANNELS.payloadSent, (message) => { messages.push(message); });

      const debug = new Debug({ payload: true });
      debug.on('debug', (text) => {
        assert.strictEqual(text, 'payload');
        assert.lengthOf(messages, 1);

        done();
      });

      debug.payload(() => 'payload', payload);
    });
  });

  describe('tedious:token:received', function() {
    it('publishes the token', function() {
      const token = { name: 'test' } as Token;
      const messages: any[] = [];
      subscribe(CHANNELS.tokenReceived, (message) => { messages.push(message); });

      const debug = new Debug();
      debug.token(token);

      assert.lengthOf(messages, 1);
      assert.strictEqual(messages[0].token, token);
    });
  });

  describe('tedious:log', function() {
    it('publishes log messages', function() {
      const messages: any[] = [];
      subscribe(CHANNELS.log, (message) => { messages.push(message); });

      const debug = new Debug();
      debug.log('a log message');

      assert.lengthOf(messages, 1);
      assert.strictEqual(messages[0].message, 'a log message');
    });
  });

  describe('tedious:connection:state', function() {
    it('publishes state transitions', function(done) {
      const messages: any[] = [];
      subscribe(CHANNELS.connectionState, (message) => { messages.push(message); });

      const connection = new Connection({
        server: '127.0.0.1',
        options: { port: 1, connectTimeout: 30000 },
        authentication: { type: 'default', options: { userName: 'user', password: 'pw' } }
      });

      connection.connect((err) => {
        assert.instanceOf(err, Error);

        assert.isAtLeast(messages.length, 2);

        assert.strictEqual(messages[0].connection, connection);
        assert.strictEqual(messages[0].oldState, 'Initialized');
        assert.strictEqual(messages[0].newState, 'Connecting');

        assert.strictEqual(messages[messages.length - 1].newState, 'Final');

        done();
      });
    });
  });

  describe('tedious:connect tracing channel', function() {
    it('publishes start, error and end events for a failed connection attempt', function(done) {
      const events: string[] = [];
      let context: any;

      subscribe('tracing:tedious:connect:start', (message) => {
        events.push('start');
        context = message;
      });
      subscribe('tracing:tedious:connect:error', (message) => {
        events.push('error');
        assert.strictEqual(message, context);
      });
      subscribe('tracing:tedious:connect:end', (message) => {
        events.push('end');
        assert.strictEqual(message, context);
      });

      const connection = new Connection({
        server: '127.0.0.1',
        options: { port: 1, connectTimeout: 30000 },
        authentication: { type: 'default', options: { userName: 'user', password: 'pw' } }
      });

      connection.connect((err) => {
        assert.instanceOf(err, Error);

        // Per `TracingChannel.tracePromise` semantics, `end` marks the end of
        // the synchronous portion of the operation and is published as soon
        // as the traced function has returned its promise; `error` is
        // published when that promise rejects.
        assert.deepEqual(events, ['start', 'end', 'error']);
        assert.strictEqual(context.connection, connection);

        done();
      });
    });
  });

  describe('tedious:request tracing channel', function() {
    it('publishes start, error, asyncStart, asyncEnd and end around the request callback', function(done) {
      const events: string[] = [];
      let context: any;

      subscribe('tracing:tedious:request:start', (message) => {
        events.push('start');
        context = message;
      });
      subscribe('tracing:tedious:request:error', (message) => {
        events.push('error');
        assert.strictEqual(message, context);
      });
      subscribe('tracing:tedious:request:asyncStart', (message) => {
        events.push('asyncStart');
        assert.strictEqual(message, context);
      });
      subscribe('tracing:tedious:request:asyncEnd', (message) => {
        events.push('asyncEnd');
        assert.strictEqual(message, context);
      });
      subscribe('tracing:tedious:request:end', (message) => {
        events.push('end');
        assert.strictEqual(message, context);
      });

      const connection = new Connection({
        server: '127.0.0.1',
        options: { port: 1 },
        authentication: { type: 'default', options: { userName: 'user', password: 'pw' } }
      });

      const request = new Request('select 1', (err) => {
        assert.instanceOf(err, Error);

        // At this point the callback is still running - `asyncEnd` and `end`
        // are only published once it returns.
        assert.deepEqual(events, ['start', 'error', 'asyncStart']);

        process.nextTick(() => {
          // The request failed synchronously as the connection was never
          // established - the callback (asyncStart/asyncEnd) ran before
          // `makeRequest` returned (end).
          assert.deepEqual(events, ['start', 'error', 'asyncStart', 'asyncEnd', 'end']);

          assert.strictEqual(context.connection, connection);
          assert.strictEqual(context.request, request);
          assert.instanceOf(context.error, Error);

          done();
        });
      });

      connection.execSql(request);
    });

    it('restores the original request callback after completion', function(done) {
      subscribe('tracing:tedious:request:start', () => {});

      const connection = new Connection({
        server: '127.0.0.1',
        options: { port: 1 },
        authentication: { type: 'default', options: { userName: 'user', password: 'pw' } }
      });

      const request = new Request('select 1', (err) => {
        assert.instanceOf(err, Error);

        process.nextTick(() => {
          assert.strictEqual(request.callback, originalCallback);

          done();
        });
      });

      const originalCallback = request.callback;

      connection.execSql(request);
    });

    it('does not wrap the request callback when there are no subscribers', function(done) {
      const connection = new Connection({
        server: '127.0.0.1',
        options: { port: 1 },
        authentication: { type: 'default', options: { userName: 'user', password: 'pw' } }
      });

      const request = new Request('select 1', (err) => {
        assert.instanceOf(err, Error);

        done();
      });

      const originalCallback = request.callback;

      connection.execSql(request);
      assert.strictEqual(request.callback, originalCallback);
    });
  });
});
