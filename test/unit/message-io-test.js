const Debug = require('../../src/debug');
const Duplex = require('stream').Duplex;
const MessageIO = require('../../src/message-io');
const Packet = require('../../src/packet').Packet;
const assert = require('chai').assert;


class Connection extends Duplex {
  _read(size) { }

  _write(chunk, encoding, callback) {
    var packet = new Packet(chunk);
    this.emit('packet', packet);
    callback();
  }
}

const packetType = 2;
const packetSize = 8 + 4;

describe('Message IO', function() {
  it('should send smaller than one packet', function(done) {
    const payload = Buffer.from([1, 2, 3]);

    const connection = new Connection();
    connection.on('packet', function(packet) {
      assert.isOk(packet.last());
      assert.strictEqual(packet.type(), packetType);
      assert.isOk(packet.data().equals(payload));

      done();
    });

    const io = new MessageIO(connection, packetSize, new Debug());
    io.sendMessage(packetType, payload);
  });

  it('should send exact packet', function(done) {
    const payload = Buffer.from([1, 2, 3, 4]);

    const connection = new Connection();
    connection.on('packet', function(packet) {
      assert.isOk(packet.last());
      assert.strictEqual(packet.type(), packetType);
      assert.isOk(packet.data().equals(payload));

      done();
    });

    const io = new MessageIO(connection, packetSize, new Debug());
    io.sendMessage(packetType, payload);
  });

  it('should send one longer than packet', function(done) {
    const payload = Buffer.from([1, 2, 3, 4, 5]);
    let packetNumber = 0;

    const connection = new Connection();
    connection.on('packet', function(packet) {
      packetNumber++;

      assert.strictEqual(packet.type(), packetType);

      switch (packetNumber) {
        case 1:
          assert.isOk(!packet.last());
          assert.strictEqual(packet.packetId(), packetNumber);
          assert.isOk(packet.data().equals(Buffer.from([1, 2, 3, 4])));
          break;
        case 2:
          assert.isOk(packet.last());
          assert.strictEqual(packet.packetId(), packetNumber);
          assert.isOk(packet.data().equals(Buffer.from([5])));
          done();
          break;
      }
    });

    const io = new MessageIO(connection, packetSize, new Debug());
    io.sendMessage(packetType, payload);
  });

  it('should recieve one packet', function(done) {
    const payload = Buffer.from([1, 2, 3]);
    const connection = new Connection();

    const io = new MessageIO(connection, packetSize, new Debug());
    io.on('data', function(data) {
      assert.isOk(data.equals(payload));
    });
    io.on('message', function() {
      done();
    });

    const packet = new Packet(packetType);
    packet.last(true);
    packet.addData(payload);
    connection.push(packet.buffer);
  });

  it('should recieve one packet in two chunks', function(done) {
    const payload = Buffer.from([1, 2, 3]);
    const connection = new Connection();

    const io = new MessageIO(connection, packetSize, new Debug());
    io.on('data', function(data) {
      assert.isOk(data.equals(payload));
    });
    io.on('message', function() {
      done();
    });

    const packet = new Packet(packetType);
    packet.last(true);
    packet.addData(payload);
    connection.push(packet.buffer.slice(0, 4));
    connection.push(packet.buffer.slice(4));
  });

  it('should recieve two packets', function(done) {
    const payload = Buffer.from([1, 2, 3]);
    const payload1 = payload.slice(0, 2);
    const payload2 = payload.slice(2, 3);

    const connection = new Connection();
    let receivedPacketCount = 0;

    const io = new MessageIO(connection, packetSize, new Debug());
    io.on('data', function(data) {
      receivedPacketCount++;

      switch (receivedPacketCount) {
        case 1:
          assert.isOk(data.equals(payload1));
          break;
        case 2:
          assert.isOk(data.equals(payload2));
          break;
      }
    });
    io.on('message', function() {
      done();
    });

    let packet = new Packet(packetType);
    packet.addData(payload1);
    connection.push(packet.buffer);

    packet = new Packet(packetType);
    packet.last(true);
    packet.addData(payload2);
    connection.push(packet.buffer);
  });

  it('should recieve two packets with chunk spanning packets', function(done) {
    const payload = Buffer.from([1, 2, 3, 4]);
    const payload1 = payload.slice(0, 2);
    const payload2 = payload.slice(2, 4);

    const connection = new Connection();
    let receivedPacketCount = 0;

    const io = new MessageIO(connection, packetSize, new Debug());
    io.on('data', function(data) {
      receivedPacketCount++;

      switch (receivedPacketCount) {
        case 1:
          assert.isOk(data.equals(payload1));
          break;
        case 2:
          assert.isOk(data.equals(payload2));
          break;
      }
    });
    io.on('message', function() {
      done();
    });

    const packet1 = new Packet(packetType);
    packet1.addData(payload.slice(0, 2));

    const packet2 = new Packet(packetType);
    packet2.last(true);
    packet2.addData(payload.slice(2, 4));

    connection.push(packet1.buffer.slice(0, 6));
    connection.push(
      Buffer.concat([packet1.buffer.slice(6), packet2.buffer.slice(0, 4)])
    );
    connection.push(packet2.buffer.slice(4));
  });

  it('should recieve multiple packets with more than one packet from one chunk', function(done) {
    const payload = Buffer.from([1, 2, 3, 4, 5, 6]);
    const connection = new Connection();
    let receivedData = Buffer.alloc(0);

    const io = new MessageIO(connection, packetSize, new Debug());
    io.on('data', function(data) {
      receivedData = Buffer.concat([receivedData, data]);
    });

    io.on('message', function() {
      assert.deepEqual(payload, receivedData);
      done();
    });

    const packet1 = new Packet(packetType);
    packet1.addData(payload.slice(0, 2));

    const packet2 = new Packet(packetType);
    packet2.addData(payload.slice(2, 4));

    const packet3 = new Packet(packetType);
    packet3.last(true);
    packet3.addData(payload.slice(4, 6));

    const allData = Buffer.concat([packet1.buffer, packet2.buffer, packet3.buffer]);
    const data1 = allData.slice(0, 5);
    const data2 = allData.slice(5);

    connection.push(data1);
    connection.push(data2);
  });
});
