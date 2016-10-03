'use strict';

var Connection, Debug, Duplex, MessageIO, Packet, packetSize, packetType,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

Debug = require('../../src/debug');

Duplex = require('stream').Duplex;

require('../../src/buffertools');

MessageIO = require('../../src/message-io');

Packet = require('../../src/packet').Packet;

require('../../src/buffertools');

Connection = (function(superClass) {
  extend(Connection, superClass);

  function Connection() {
    return Connection.__super__.constructor.apply(this, arguments);
  }

  Connection.prototype._read = function(size) {};

  Connection.prototype._write = function(chunk, encoding, callback) {
    var packet;
    packet = new Packet(chunk);
    this.emit('packet', packet);
    return callback();
  };

  return Connection;

})(Duplex);

packetType = 2;

packetSize = 8 + 4;

exports.sendSmallerThanOnePacket = function(test) {
  var connection, io, payload;
  payload = new Buffer([1, 2, 3]);
  connection = new Connection();
  connection.on('packet', function(packet) {
    test.ok(packet.last());
    test.strictEqual(packet.type(), packetType);
    test.ok(packet.data().equals(payload));
    return test.done();
  });
  io = new MessageIO(connection, packetSize, new Debug());
  return io.sendMessage(packetType, payload);
};

exports.sendExactlyPacket = function(test) {
  var connection, io, payload;
  payload = new Buffer([1, 2, 3, 4]);
  connection = new Connection();
  connection.on('packet', function(packet) {
    test.ok(packet.last());
    test.strictEqual(packet.type(), packetType);
    test.ok(packet.data().equals(payload));
    return test.done();
  });
  io = new MessageIO(connection, packetSize, new Debug());
  return io.sendMessage(packetType, payload);
};

exports.sendOneLongerThanPacket = function(test) {
  var connection, io, packetNumber, payload;
  payload = new Buffer([1, 2, 3, 4, 5]);
  packetNumber = 0;
  connection = new Connection();
  connection.on('packet', function(packet) {
    packetNumber++;
    test.strictEqual(packet.type(), packetType);
    switch (packetNumber) {
      case 1:
        test.ok(!packet.last());
        test.strictEqual(packet.packetId(), packetNumber);
        return test.ok(packet.data().equals(new Buffer([1, 2, 3, 4])));
      case 2:
        test.ok(packet.last());
        test.strictEqual(packet.packetId(), packetNumber);
        test.ok(packet.data().equals(new Buffer([5])));
        return test.done();
    }
  });
  io = new MessageIO(connection, packetSize, new Debug());
  return io.sendMessage(packetType, payload);
};

exports.receiveOnePacket = function(test) {
  var connection, io, packet, payload;
  test.expect(1);
  payload = new Buffer([1, 2, 3]);
  connection = new Connection();
  io = new MessageIO(connection, packetSize, new Debug());
  io.on('data', function(data) {
    return test.ok(data.equals(payload));
  });
  io.on('message', function() {
    return test.done();
  });
  packet = new Packet(packetType);
  packet.last(true);
  packet.addData(payload);
  return connection.push(packet.buffer);
};

exports.receiveOnePacketInTwoChunks = function(test) {
  var connection, io, packet, payload;
  test.expect(1);
  payload = new Buffer([1, 2, 3]);
  connection = new Connection();
  io = new MessageIO(connection, packetSize, new Debug());
  io.on('data', function(data) {
    return test.ok(data.equals(payload));
  });
  io.on('message', function() {
    return test.done();
  });
  packet = new Packet(packetType);
  packet.last(true);
  packet.addData(payload);
  connection.push(packet.buffer.slice(0, 4));
  return connection.push(packet.buffer.slice(4));
};

exports.receiveTwoPackets = function(test) {
  var connection, io, packet, payload, payload1, payload2, receivedPacketCount;
  test.expect(2);
  payload = new Buffer([1, 2, 3]);
  payload1 = payload.slice(0, 2);
  payload2 = payload.slice(2, 3);
  connection = new Connection();
  receivedPacketCount = 0;
  io = new MessageIO(connection, packetSize, new Debug());
  io.on('data', function(data) {
    receivedPacketCount++;
    switch (receivedPacketCount) {
      case 1:
        return test.ok(data.equals(payload1));
      case 2:
        return test.ok(data.equals(payload2));
    }
  });
  io.on('message', function() {
    return test.done();
  });
  packet = new Packet(packetType);
  packet.addData(payload1);
  connection.push(packet.buffer);
  packet = new Packet(packetType);
  packet.last(true);
  packet.addData(payload2);
  return connection.push(packet.buffer);
};

exports.receiveTwoPacketsWithChunkSpanningPackets = function(test) {
  var connection, io, packet1, packet2, payload, payload1, payload2, receivedPacketCount;
  test.expect(2);
  payload = new Buffer([1, 2, 3, 4]);
  payload1 = payload.slice(0, 2);
  payload2 = payload.slice(2, 4);
  connection = new Connection();
  receivedPacketCount = 0;
  io = new MessageIO(connection, packetSize, new Debug());
  io.on('data', function(data) {
    receivedPacketCount++;
    switch (receivedPacketCount) {
      case 1:
        return test.ok(data.equals(payload1));
      case 2:
        return test.ok(data.equals(payload2));
    }
  });
  io.on('message', function() {
    return test.done();
  });
  packet1 = new Packet(packetType);
  packet1.addData(payload.slice(0, 2));
  packet2 = new Packet(packetType);
  packet2.last(true);
  packet2.addData(payload.slice(2, 4));
  connection.push(packet1.buffer.slice(0, 6));
  connection.push(Buffer.concat([packet1.buffer.slice(6), packet2.buffer.slice(0, 4)]));
  return connection.push(packet2.buffer.slice(4));
};

exports.receiveMultiplePacketsWithMoreThanOnePacketFromOneChunk = function(test) {
  var allData, connection, data1, data2, io, packet1, packet2, packet3, payload, receivedData;
  test.expect(1);
  payload = new Buffer([1, 2, 3, 4, 5, 6]);
  connection = new Connection();
  receivedData = new Buffer(0);
  io = new MessageIO(connection, packetSize, new Debug());
  io.on('data', function(data) {
    return receivedData = Buffer.concat([receivedData, data]);
  });
  io.on('message', function() {
    test.deepEqual(payload, receivedData);
    return test.done();
  });
  packet1 = new Packet(packetType);
  packet1.addData(payload.slice(0, 2));
  packet2 = new Packet(packetType);
  packet2.addData(payload.slice(2, 4));
  packet3 = new Packet(packetType);
  packet3.last(true);
  packet3.addData(payload.slice(4, 6));
  allData = Buffer.concat([packet1.buffer, packet2.buffer, packet3.buffer]);
  data1 = allData.slice(0, 5);
  data2 = allData.slice(5);
  connection.push(data1);
  return connection.push(data2);
};
