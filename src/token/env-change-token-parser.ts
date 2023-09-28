import { type ParserOptions } from './stream-parser';
import { Collation } from '../collation';

import {
  DatabaseEnvChangeToken,
  LanguageEnvChangeToken,
  CharsetEnvChangeToken,
  PacketSizeEnvChangeToken,
  BeginTransactionEnvChangeToken,
  CommitTransactionEnvChangeToken,
  RollbackTransactionEnvChangeToken,
  DatabaseMirroringPartnerEnvChangeToken,
  ResetConnectionEnvChangeToken,
  RoutingEnvChangeToken,
  CollationChangeToken,
  type EnvChangeToken
} from './token';

import { NotEnoughDataError, readBVarByte, readBVarChar, readUInt16LE, readUInt8, readUsVarByte, type Result } from './helpers';
import type { BufferList } from 'bl/BufferList';

const types: { [key: number]: { name: string, event?: string }} = {
  1: {
    name: 'DATABASE',
    event: 'databaseChange'
  },
  2: {
    name: 'LANGUAGE',
    event: 'languageChange'
  },
  3: {
    name: 'CHARSET',
    event: 'charsetChange'
  },
  4: {
    name: 'PACKET_SIZE',
    event: 'packetSizeChange'
  },
  7: {
    name: 'SQL_COLLATION',
    event: 'sqlCollationChange'
  },
  8: {
    name: 'BEGIN_TXN',
    event: 'beginTransaction'
  },
  9: {
    name: 'COMMIT_TXN',
    event: 'commitTransaction'
  },
  10: {
    name: 'ROLLBACK_TXN',
    event: 'rollbackTransaction'
  },
  13: {
    name: 'DATABASE_MIRRORING_PARTNER',
    event: 'partnerNode'
  },
  17: {
    name: 'TXN_ENDED'
  },
  18: {
    name: 'RESET_CONNECTION',
    event: 'resetConnection'
  },
  20: {
    name: 'ROUTING_CHANGE',
    event: 'routingChange'
  }
};

function _readNewAndOldValue(buf: Buffer | BufferList, offset: number, length: number, type: { name: string, event?: string }): Result<EnvChangeToken | undefined> {
  switch (type.name) {
    case 'DATABASE':
    case 'LANGUAGE':
    case 'CHARSET':
    case 'PACKET_SIZE':
    case 'DATABASE_MIRRORING_PARTNER': {
      let newValue;
      ({ offset, value: newValue } = readBVarChar(buf, offset));

      let oldValue;
      ({ offset, value: oldValue } = readBVarChar(buf, offset));

      switch (type.name) {
        case 'PACKET_SIZE':
          return { value: new PacketSizeEnvChangeToken(parseInt(newValue), parseInt(oldValue)), offset };

        case 'DATABASE':
          return { value: new DatabaseEnvChangeToken(newValue, oldValue), offset };

        case 'LANGUAGE':
          return { value: new LanguageEnvChangeToken(newValue, oldValue), offset };

        case 'CHARSET':
          return { value: new CharsetEnvChangeToken(newValue, oldValue), offset };

        case 'DATABASE_MIRRORING_PARTNER':
          return { value: new DatabaseMirroringPartnerEnvChangeToken(newValue, oldValue), offset };
      }

      throw new Error('unreachable');
    }

    case 'SQL_COLLATION':
    case 'BEGIN_TXN':
    case 'COMMIT_TXN':
    case 'ROLLBACK_TXN':
    case 'RESET_CONNECTION': {
      let newValue;
      ({ offset, value: newValue } = readBVarByte(buf, offset));

      let oldValue;
      ({ offset, value: oldValue } = readBVarByte(buf, offset));

      switch (type.name) {
        case 'SQL_COLLATION': {
          const newCollation = newValue.length ? Collation.fromBuffer(newValue) : undefined;
          const oldCollation = oldValue.length ? Collation.fromBuffer(oldValue) : undefined;

          return { value: new CollationChangeToken(newCollation, oldCollation), offset };
        }

        case 'BEGIN_TXN':
          return { value: new BeginTransactionEnvChangeToken(newValue, oldValue), offset };

        case 'COMMIT_TXN':
          return { value: new CommitTransactionEnvChangeToken(newValue, oldValue), offset };

        case 'ROLLBACK_TXN':
          return { value: new RollbackTransactionEnvChangeToken(newValue, oldValue), offset };

        case 'RESET_CONNECTION':
          return { value: new ResetConnectionEnvChangeToken(newValue, oldValue), offset };
      }

      throw new Error('unreachable');
    }

    case 'ROUTING_CHANGE': {
      let routePacket;
      ({ offset, value: routePacket } = readUsVarByte(buf, offset));

      let oldValue;
      ({ offset, value: oldValue } = readUsVarByte(buf, offset));

      // Routing Change:
      // Byte 1: Protocol (must be 0)
      // Bytes 2-3 (USHORT): Port number
      // Bytes 4-5 (USHORT): Length of server data in unicode (2byte chars)
      // Bytes 6-*: Server name in unicode characters
      const protocol = routePacket.readUInt8(0);
      if (protocol !== 0) {
        throw new Error('Unknown protocol byte in routing change event');
      }

      const port = routePacket.readUInt16LE(1);
      const serverLen = routePacket.readUInt16LE(3);
      // 2 bytes per char, starting at offset 5
      const server = routePacket.toString('ucs2', 5, 5 + (serverLen * 2));

      const newValue = {
        protocol: protocol,
        port: port,
        server: server
      };

      return { value: new RoutingEnvChangeToken(newValue, oldValue), offset };
    }

    default: {
      console.error('Tedious > Unsupported ENVCHANGE type ' + type.name);

      // skip unknown bytes
      return { value: undefined, offset: offset + length - 1 };
    }
  }
}

function envChangeParser(buf: Buffer | BufferList, offset: number, _options: ParserOptions): Result<EnvChangeToken | undefined> {
  let tokenLength;
  ({ offset, value: tokenLength } = readUInt16LE(buf, offset));

  if (buf.length < offset + tokenLength) {
    throw new NotEnoughDataError(offset + tokenLength);
  }

  let typeNumber;
  ({ offset, value: typeNumber } = readUInt8(buf, offset));

  const type = types[typeNumber];

  if (!type) {
    console.error('Tedious > Unsupported ENVCHANGE type ' + typeNumber);
    return { value: undefined, offset: offset + tokenLength - 1 };
  }

  return _readNewAndOldValue(buf, offset, tokenLength, type);
}

export default envChangeParser;
module.exports = envChangeParser;
