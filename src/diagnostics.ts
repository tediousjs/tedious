import * as dc from 'node:diagnostics_channel';

import type Connection from './connection';
import type Request from './request';
import type BulkLoad from './bulk-load';
import type { Packet } from './packet';
import type { Token } from './token/token';

/**
 * The names of the diagnostics channels published by `tedious`.
 *
 * Channels can be subscribed to via the `node:diagnostics_channel` module:
 *
 * ```js
 * const dc = require('node:diagnostics_channel');
 *
 * dc.subscribe('tedious:packet:received', (message) => {
 *   // ...
 * });
 * ```
 *
 * `tedious:connect` and `tedious:request` are tracing channels (see
 * [`diagnostics_channel.tracingChannel`](https://nodejs.org/api/diagnostics_channel.html#diagnostics_channeltracingchannelnameorchannels))
 * and publish `tracing:tedious:connect:start` etc. As with all tracing
 * channels, subscribers should be registered before any traced operations are
 * initiated.
 *
 * @experimental The channel message shapes - including the `tedious` internal
 *   objects (connections, packets, tokens, payloads, requests) they expose -
 *   are experimental and may change in any release without notice. Channel
 *   names are stable; if a message shape ever needs to change incompatibly
 *   after stabilization, the new shape will be published under a new channel
 *   name.
 */
export const CHANNELS = {
  /** A TDS packet was sent to the server. Message: {@link PacketMessage} */
  packetSent: 'tedious:packet:sent',
  /** A TDS packet was received from the server. Message: {@link PacketMessage} */
  packetReceived: 'tedious:packet:received',
  /** A message payload (e.g. PRELOGIN, LOGIN7, a client request) was sent to the server. Message: {@link PayloadMessage} */
  payloadSent: 'tedious:payload:sent',
  /** A message payload was received from the server. Message: {@link PayloadMessage} */
  payloadReceived: 'tedious:payload:received',
  /** A token was parsed from the server's token stream. Message: {@link TokenMessage} */
  tokenReceived: 'tedious:token:received',
  /** A connection's internal state machine transitioned to a new state. Message: {@link StateChangeMessage} */
  connectionState: 'tedious:connection:state',
  /** A diagnostic log message. Message: {@link LogMessage} */
  log: 'tedious:log',
  /** Tracing channel around establishing a connection. Context: {@link ConnectMessage} */
  connect: 'tedious:connect',
  /** Tracing channel around executing a request. Context: {@link RequestMessage} */
  request: 'tedious:request'
} as const;

/**
 * Message published on the `tedious:packet:sent` and `tedious:packet:received` channels.
 *
 * @experimental
 */
export interface PacketMessage {
  /**
   * The connection the packet was sent or received on. `undefined` when the
   * packet is not associated with a connection.
   */
  connection: Connection | undefined;

  /**
   * The TDS packet, including its header and raw data. Must be treated as
   * read-only.
   */
  packet: Packet;
}

/**
 * Message published on the `tedious:payload:sent` and `tedious:payload:received` channels.
 *
 * Note: for LOGIN7 messages, the payload object carries the credentials used
 * to authenticate. Subscribers must take care not to expose these, e.g. when
 * logging payloads.
 *
 * @experimental
 */
export interface PayloadMessage {
  /**
   * The connection the payload was sent or received on.
   */
  connection: Connection | undefined;

  /**
   * The payload object (e.g. a PRELOGIN, LOGIN7, NTLM or client request
   * payload). A human-readable representation can be obtained by calling
   * `toString()`. Must be treated as read-only.
   */
  payload: { toString(indent?: string): string };
}

/**
 * Message published on the `tedious:token:received` channel.
 *
 * @experimental
 */
export interface TokenMessage {
  /**
   * The connection the token was received on.
   */
  connection: Connection | undefined;

  /**
   * The token parsed from the server's token stream. Must be treated as
   * read-only.
   */
  token: Token;
}

/**
 * Message published on the `tedious:connection:state` channel.
 *
 * @experimental
 */
export interface StateChangeMessage {
  /**
   * The connection whose state changed.
   */
  connection: Connection | undefined;

  /**
   * The name of the state the connection is transitioning out of, or
   * `undefined` for the initial transition.
   */
  oldState: string | undefined;

  /**
   * The name of the state the connection is transitioning into.
   */
  newState: string;
}

/**
 * Message published on the `tedious:log` channel.
 *
 * @experimental
 */
export interface LogMessage {
  /**
   * The connection the message originates from.
   */
  connection: Connection | undefined;

  /**
   * The diagnostic log message.
   */
  message: string;
}

/**
 * Context object used for the `tedious:connect` tracing channel.
 *
 * @experimental
 */
export interface ConnectMessage {
  /**
   * The connection being established.
   */
  connection: Connection;
}

/**
 * Context object used for the `tedious:request` tracing channel.
 *
 * @experimental
 */
export interface RequestMessage {
  /**
   * The connection the request is executed on.
   */
  connection: Connection;

  /**
   * The request being executed.
   */
  request: Request | BulkLoad;

  /**
   * The TDS packet type of the request message (see `Packet.TYPE`), e.g.
   * SQL Batch, RPC Request, Bulk Load or Transaction Manager Request.
   */
  packetType: number;

  /**
   * The error the request failed with, if any. Only set on the
   * `tracing:tedious:request:error` publish and afterwards.
   */
  error?: Error | undefined;

  /**
   * The number of rows the request produced. Only set once the request has
   * completed.
   */
  rowCount?: number | undefined;
}

export const packetSentChannel = dc.channel(CHANNELS.packetSent);
export const packetReceivedChannel = dc.channel(CHANNELS.packetReceived);
export const payloadSentChannel = dc.channel(CHANNELS.payloadSent);
export const payloadReceivedChannel = dc.channel(CHANNELS.payloadReceived);
export const tokenReceivedChannel = dc.channel(CHANNELS.tokenReceived);
export const connectionStateChannel = dc.channel(CHANNELS.connectionState);
export const logChannel = dc.channel(CHANNELS.log);

export const connectTracingChannel = dc.tracingChannel<unknown, ConnectMessage>(CHANNELS.connect);
export const requestTracingChannel = dc.tracingChannel<unknown, RequestMessage>(CHANNELS.request);
