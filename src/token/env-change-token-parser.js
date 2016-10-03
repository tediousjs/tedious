'use strict';

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

function readBVarCharValues(type, length) {
  const newValueLength = this.readUInt8(0);
  let newValue = this.buffer.toString('ucs2', 1, 1 + newValueLength);

  const oldValueLength = this.readUInt8(1 + newValueLength);
  let oldValue = this.buffer.toString('ucs2', 1 + newValueLength + 1, 1 + newValueLength + 1 + oldValueLength);

  if (type.name === 'PACKET_SIZE') {
    newValue = parseInt(newValue, 10);
    oldValue = parseInt(oldValue, 10);
  }

  parser.push({
    name: 'ENVCHANGE',
    type: type.name,
    event: type.event,
    oldValue: oldValue,
    newValue: newValue
  });

  this.consumeBytes(length);
  return this.parseNextToken;
}

function readBVarByteValues(type, length) {
  const newValueLength = this.readUInt8(0);
  const newValue = this.buffer.slice(this.position + 1, this.position + 1 + newValueLength);

  const oldValueLength = this.readUInt8(1 + newValueLength);
  const oldValue = this.buffer.slice(this.position + 1 + newValueLength + 1, this.position + 1 + newValueLength + 1 + oldValueLength);

  parser.push({
    name: 'ENVCHANGE',
    type: type.name,
    event: type.event,
    oldValue: oldValue,
    newValue: newValue
  });

  this.consumeBytes(length);
  return this.parseNextToken;
}

function readRoutingValues(type, length) {
  const valueLength = this.readUInt16LE();

  // Routing Change:
  // Byte 1: Protocol (must be 0)
  // Bytes 2-3 (USHORT): Port number
  // Bytes 4-5 (USHORT): Length of server data in unicode (2byte chars)
  // Bytes 6-*: Server name in unicode characters
  const protocol = this.readUInt8(2);

  if (protocol !== 0) {
    return parser.emit('error', new Error('Unknown protocol byte in routing change event'));
  }

  const port = this.readUInt16LE(3);
  const serverLen = this.readUInt16LE(5);
  // 2 bytes per char, starting at offset 5
  const server = this.toString('ucs2', this.position + 7, this.position + 7 + (serverLen * 2));

  newValue = {
    protocol: protocol,
    port: port,
    server: server
  };

  const oldValueLength = this.readUInt16LE(7 + (serverLen * 2));
  oldValue = undefined;
}

module.exports = function(parser, colMetadata, options, callback) {
  if (!this.bytesAvailable(2)) {
    return;
  }

  const length = this.readUInt16LE();
  if (!this.bytesAvailable(2 + length)) {
    return;
  }

  const typeNumber = this.readUInt8(2);
  const type = types[typeNumber];

  this.consumeBytes(3);

  if (!type) {
    console.error('Tedious > Unsupported ENVCHANGE type ' + typeNumber);
    this.consumeBytes(length - 1);
    return this.parseNextToken;
  }

  switch (type.name) {
    case 'DATABASE':
    case 'LANGUAGE':
    case 'CHARSET':
    case 'PACKET_SIZE':
    case 'DATABASE_MIRRORING_PARTNER':
      return readBVarCharValues.call(this, type, length - 1);

    case 'SQL_COLLATION':
    case 'BEGIN_TXN':
    case 'COMMIT_TXN':
    case 'ROLLBACK_TXN':
    case 'RESET_CONNECTION':
      return readBVarByteValues.call(this, type, length - 1);

    case 'ROUTING_CHANGE':
      return readRoutingValues.call(this, type, length - 1);

    default:
      console.error('Tedious > Unsupported ENVCHANGE type ' + type.name);
      this.consumeBytes(length - 1);
      return this.parseNextToken;
  }
};
