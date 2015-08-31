const types = {
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

export default function* (parser) {
  let newValue, oldValue;

  const length = yield parser.readUInt16LE();
  const typeNumber = yield parser.readUInt8();
  const type = types[typeNumber];

  if (type) {
    switch (type.name) {
      case 'DATABASE':
      case 'LANGUAGE':
      case 'CHARSET':
      case 'PACKET_SIZE':
      case 'DATABASE_MIRRORING_PARTNER':
        newValue = yield* parser.readBVarChar();
        oldValue = yield* parser.readBVarChar();
        break;

      case 'SQL_COLLATION':
      case 'BEGIN_TXN':
      case 'COMMIT_TXN':
      case 'ROLLBACK_TXN':
      case 'RESET_CONNECTION':
        newValue = yield* parser.readBVarByte();
        oldValue = yield* parser.readBVarByte();
        break;

      case 'ROUTING_CHANGE':
        let valueLength = yield parser.readUInt16LE();

        // Routing Change:
        // Byte 1: Protocol (must be 0)
        // Bytes 2-3 (USHORT): Port number
        // Bytes 4-5 (USHORT): Length of server data in unicode (2byte chars)
        // Bytes 6-*: Server name in unicode characters

        const routePacket = yield parser.readBuffer(valueLength);
        const protocol = routePacket.readUInt8(0);

        if (protocol !== 0) {
          throw new Error('Unknown protocol byte in routing change event');
        }

        const port = routePacket.readUInt16LE(1);
        const serverLen = routePacket.readUInt16LE(3);
        // 2 bytes per char, starting at offset 5
        const server = routePacket.toString('ucs2', 5, 5 + (serverLen * 2));

        newValue = {
          protocol: protocol,
          port: port,
          server: server
        };

        valueLength = yield parser.readUInt16LE();
        oldValue = yield parser.readBuffer(valueLength);

        break;

      default:
        console.error("Tedious > Unsupported ENVCHANGE type " + typeNumber);
        yield parser.readBuffer(length - 1); // skip unknown bytes
        return;
    }

    if (type.name === 'PACKET_SIZE') {
      newValue = parseInt(newValue);
      oldValue = parseInt(oldValue);
    }
  } else {
    console.error("Tedious > Unsupported ENVCHANGE type " + typeNumber);
    yield parser.readBuffer(length - 1); // skip unknown bytes
    return;
  }

  return {
    name: 'ENVCHANGE',
    type: type.name,
    event: type.event,
    oldValue: oldValue,
    newValue: newValue
  };
}
