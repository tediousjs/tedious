var Debug = require('../../src/debug');
var Duplex = require('stream').Duplex;
var MessageIO = require('../../src/message-io');
var IncomingMessageStream = require('../../src/message/incoming-message-stream');
var { Packet, TYPE, HEADER_LENGTH } = require('../../src/packet');
class Connection extends Duplex {
  _read(size) {}

  _write(chunk, encoding, callback) {
    var packet = new Packet(chunk);
    this.emit('packet', packet);
    callback();
  }
}

var packetType = TYPE.SQL_BATCH;
var packetSize = HEADER_LENGTH + 4;

exports.receiveOnePacket = function(test) {
  test.expect(1);

  var payload = new Buffer([1, 2, 3]);
  var connection = new Connection();
  var debug = new Debug();

  var incomingMessageStream = new IncomingMessageStream(debug);
  incomingMessageStream.on('data', (message) => {
    message.on('data', (data) => {
      test.ok(data.equals(payload));
    }
    );
    message.on('end', () => {
      test.done();
    }
    );
  });

  var io = new MessageIO(connection, incomingMessageStream, packetSize, debug);

  var packet = new Packet(packetType);
  packet.last(true);
  packet.addData(payload);
  connection.push(packet.buffer);
};

exports.receiveOnePacketInTwoChunks = function(test) {
  test.expect(1);

  var payload = new Buffer([1, 2, 3]);
  var connection = new Connection();
  var debug = new Debug();
  var incomingMessageStream = new IncomingMessageStream(debug);
  incomingMessageStream.on('data', (message) => {
    message.on('data', function(data) {
      test.ok(data.equals(payload));
    });
    message.on('end', function() {
      test.done();
    });
  });

  var io = new MessageIO(connection, incomingMessageStream, packetSize, debug);

  var packet = new Packet(packetType);
  packet.last(true);
  packet.addData(payload);
  connection.push(packet.buffer.slice(0, 4));
  connection.push(packet.buffer.slice(4));
};

exports.receiveTwoPackets = function(test) {
  test.expect(2);

  var payload = new Buffer([1, 2, 3]);
  var payload1 = payload.slice(0, 2);
  var payload2 = payload.slice(2, 3);

  var connection = new Connection();
  var debug = new Debug();
  var incomingMessageStream = new IncomingMessageStream(debug);
  var receivedPacketCount = 0;

  incomingMessageStream.on('data', (message) => {
    message.on('data', (data) => {
      receivedPacketCount++;

      switch (receivedPacketCount) {
        case 1:
          test.ok(data.equals(payload1));
          break;
        case 2:
          test.ok(data.equals(payload2));
          break;
      }
    });

    message.on('end', () => {
      test.done();
    });
  });

  var io = new MessageIO(connection, incomingMessageStream, packetSize, debug);

  var packet = new Packet(packetType);
  packet.addData(payload1);
  connection.push(packet.buffer);

  packet = new Packet(packetType);
  packet.last(true);
  packet.addData(payload2);
  connection.push(packet.buffer);
};

exports.receiveTwoPacketsWithChunkSpanningPackets = function(test) {
  test.expect(2);

  var payload = new Buffer([1, 2, 3, 4]);
  var payload1 = payload.slice(0, 2);
  var payload2 = payload.slice(2, 4);

  var connection = new Connection();
  var debug = new Debug();
  var incomingMessageStream = new IncomingMessageStream(debug);
  var receivedPacketCount = 0;

  incomingMessageStream.on('data', (message) => {
    message.on('data', (data) => {
      receivedPacketCount++;

      switch (receivedPacketCount) {
        case 1:
          test.ok(data.equals(payload1));
          break;
        case 2:
          test.ok(data.equals(payload2));
          break;
      }
    });

    message.on('end', () => {
      test.done();
    });
  });

  var io = new MessageIO(connection, incomingMessageStream, packetSize, debug);

  var packet1 = new Packet(packetType);
  packet1.addData(payload.slice(0, 2));

  var packet2 = new Packet(packetType);
  packet2.last(true);
  packet2.addData(payload.slice(2, 4));

  connection.push(packet1.buffer.slice(0, 6));
  connection.push(
    Buffer.concat([packet1.buffer.slice(6), packet2.buffer.slice(0, 4)])
  );
  connection.push(packet2.buffer.slice(4));
};

exports.receiveMultiplePacketsWithMoreThanOnePacketFromOneChunk = function(test) {
  test.expect(1);

  var payload = new Buffer([1, 2, 3, 4, 5, 6]);
  var connection = new Connection();
  var receivedData = new Buffer(0);
  var debug = new Debug();

  var incomingMessageStream = new IncomingMessageStream(debug);
  incomingMessageStream.on('data', (message) => {
    message.on('data', (data) => {
      receivedData = Buffer.concat([receivedData, data]);
    });

    message.on('end', () => {
      test.deepEqual(payload, receivedData);
      test.done();
    });
  });

  var io = new MessageIO(connection, incomingMessageStream, packetSize, debug);

  var packet1 = new Packet(packetType);
  packet1.addData(payload.slice(0, 2));

  var packet2 = new Packet(packetType);
  packet2.addData(payload.slice(2, 4));

  var packet3 = new Packet(packetType);
  packet3.last(true);
  packet3.addData(payload.slice(4, 6));

  var allData = Buffer.concat([packet1.buffer, packet2.buffer, packet3.buffer]);
  var data1 = allData.slice(0, 5);
  var data2 = allData.slice(5);

  connection.push(data1);
  connection.push(data2);
};

exports.startOutgoingMessage = (test) => {
  var connection = new Connection();
  connection.on('packet', (packet) => {
    test.ok(packet.last());
    test.strictEqual(packet.type(), packetType);
    test.ok(packet.data().equals(payload));
    test.done();
  });

  var debug = new Debug();
  var incomingMessageStream = new IncomingMessageStream(debug);
  var io = new MessageIO(connection, incomingMessageStream, packetSize, debug);


  var payload = new Buffer([1, 2, 3]);

  var message = io.startOutgoingMessage(packetType, false);
  message.end(payload);
};
