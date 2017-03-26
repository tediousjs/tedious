'use strict';

const OutgoingMessage = require('../../../src/message/outgoing-message');

module.exports.OutgoingMessage = {
  'requires packetSize to be bigger than 8': function(test) {
    test.throws(function() {
      new OutgoingMessage(1, false, 8);
    }, TypeError);

    test.throws(function() {
      new OutgoingMessage(1, false, 1);
    }, TypeError);

    test.throws(function() {
      new OutgoingMessage(1, false, -30);
    }, TypeError);

    test.done();
  },

  'transforms the written data into packets of the given type': function(test) {
    const message = new OutgoingMessage(1, false, 20);
    const data = Buffer.from('12345');

    message.on('data', function(packet) {
      test.strictEqual(1, packet.type());
      test.strictEqual(1, packet.packetId());
      test.ok(packet.isLast());
      test.strictEqual(13, packet.length());
      test.deepEqual(data, packet.data());
    });

    message.write(data);
    message.end(function() {
      test.done();
    });
  },

  'splits the written data into multiple packets': function(test) {
    const message = new OutgoingMessage(1, false, 20);
    const data = Buffer.from('123456789|123456789|123456789');

    const packets = [];

    message.on('data', function(packet) {
      packets.push(packet);
    });

    message.write(data);
    message.end(function() {
      test.strictEqual(3, packets.length);

      test.strictEqual(1, packets[0].packetId());
      test.strictEqual(1, packets[0].type());
      test.ok(!packets[0].isLast());
      test.strictEqual(20, packets[0].length());
      test.deepEqual(Buffer.from('123456789|12'), packets[0].data());

      test.strictEqual(2, packets[1].packetId());
      test.strictEqual(1, packets[1].type());
      test.ok(!packets[1].isLast());
      test.strictEqual(20, packets[1].length());
      test.deepEqual(Buffer.from('3456789|1234'), packets[1].data());

      test.strictEqual(3, packets[2].packetId());
      test.strictEqual(1, packets[2].type());
      test.ok(packets[2].isLast());
      test.strictEqual(13, packets[2].length());
      test.deepEqual(Buffer.from('56789'), packets[2].data());

      test.done();
    });
  },

  'transforms the data as soon as possible': function(test) {
    const message = new OutgoingMessage(1, false, 20);
    const data = Buffer.from('123456789|123456789|123456789');

    const packets = [];

    message.on('data', function(packet) {
      packets.push(packet);
    });

    message.write(data, function() {
      test.strictEqual(2, packets.length);

      test.strictEqual(1, packets[0].packetId());
      test.strictEqual(1, packets[0].type());
      test.ok(!packets[0].isLast());
      test.strictEqual(20, packets[0].length());
      test.deepEqual(Buffer.from('123456789|12'), packets[0].data());

      test.strictEqual(2, packets[1].packetId());
      test.strictEqual(1, packets[1].type());
      test.ok(!packets[1].isLast());
      test.strictEqual(20, packets[1].length());
      test.deepEqual(Buffer.from('3456789|1234'), packets[1].data());
    });

    message.end(function() {
      test.strictEqual(3, packets.length);

      test.strictEqual(1, packets[0].packetId());
      test.strictEqual(1, packets[0].type());
      test.ok(!packets[0].isLast());
      test.strictEqual(20, packets[0].length());
      test.deepEqual(Buffer.from('123456789|12'), packets[0].data());

      test.strictEqual(2, packets[1].packetId());
      test.strictEqual(1, packets[1].type());
      test.ok(!packets[1].isLast());
      test.strictEqual(20, packets[1].length());
      test.deepEqual(Buffer.from('3456789|1234'), packets[1].data());

      test.strictEqual(3, packets[2].packetId());
      test.strictEqual(1, packets[2].type());
      test.ok(packets[2].isLast());
      test.strictEqual(13, packets[2].length());
      test.deepEqual(Buffer.from('56789'), packets[2].data());

      test.done();
    });
  },

  'buffers writes until a packet can be filled up': function(test) {
    const message = new OutgoingMessage(1, false, 20);
    const data = Buffer.from('123456789|123456789|123456789');

    const packets = [];

    message.on('data', function(packet) {
      packets.push(packet);
    });

    message.write(data.slice(0, 6), function() {
      test.strictEqual(0, packets.length);

      message.write(data.slice(6, 12), function() {
        test.strictEqual(0, packets.length);

        message.write(data.slice(12, 18), function() {
          test.strictEqual(1, packets.length);

          test.strictEqual(1, packets[0].packetId());
          test.strictEqual(1, packets[0].type());
          test.ok(!packets[0].isLast());
          test.strictEqual(20, packets[0].length());
          test.deepEqual(Buffer.from('123456789|12'), packets[0].data());

          message.end(function() {
            test.strictEqual(2, packets.length);

            test.strictEqual(1, packets[0].packetId());
            test.strictEqual(1, packets[0].type());
            test.ok(!packets[0].isLast());
            test.strictEqual(20, packets[0].length());
            test.deepEqual(Buffer.from('123456789|12'), packets[0].data());

            test.strictEqual(2, packets[1].packetId());
            test.strictEqual(1, packets[1].type());
            test.ok(packets[1].isLast());
            test.strictEqual(14, packets[1].length());
            test.deepEqual(Buffer.from('345678'), packets[1].data());

            test.done();
          });
        });
      });
    });
  }
};
