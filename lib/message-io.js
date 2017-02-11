'use strict';

var _getPrototypeOf = require('babel-runtime/core-js/object/get-prototype-of');

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require('babel-runtime/helpers/possibleConstructorReturn');

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require('babel-runtime/helpers/inherits');

var _inherits3 = _interopRequireDefault(_inherits2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var tls = require('tls');
var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var Transform = require('readable-stream').Transform;

require('./buffertools');

var Packet = require('./packet').Packet;
var TYPE = require('./packet').TYPE;
var packetHeaderLength = require('./packet').HEADER_LENGTH;

var ReadablePacketStream = function (_Transform) {
  (0, _inherits3.default)(ReadablePacketStream, _Transform);

  function ReadablePacketStream() {
    (0, _classCallCheck3.default)(this, ReadablePacketStream);

    var _this = (0, _possibleConstructorReturn3.default)(this, (ReadablePacketStream.__proto__ || (0, _getPrototypeOf2.default)(ReadablePacketStream)).call(this, { objectMode: true }));

    _this.buffer = new Buffer(0);
    _this.position = 0;
    return _this;
  }

  (0, _createClass3.default)(ReadablePacketStream, [{
    key: '_transform',
    value: function _transform(chunk, encoding, callback) {
      if (this.position === this.buffer.length) {
        // If we have fully consumed the previous buffer,
        // we can just replace it with the new chunk
        this.buffer = chunk;
      } else {
        // If we haven't fully consumed the previous buffer,
        // we simply concatenate the leftovers and the new chunk.
        this.buffer = Buffer.concat([this.buffer.slice(this.position), chunk], this.buffer.length - this.position + chunk.length);
      }

      this.position = 0;

      // The packet header is always 8 bytes of length.
      while (this.buffer.length >= this.position + packetHeaderLength) {
        // Get the full packet length
        var length = this.buffer.readUInt16BE(this.position + 2);

        if (this.buffer.length >= this.position + length) {
          var data = this.buffer.slice(this.position, this.position + length);
          this.position += length;
          this.push(new Packet(data));
        } else {
          // Not enough data to provide the next packet. Stop here and wait for
          // the next call to `_transform`.
          break;
        }
      }

      callback();
    }
  }]);
  return ReadablePacketStream;
}(Transform);

module.exports = function (_EventEmitter) {
  (0, _inherits3.default)(MessageIO, _EventEmitter);

  function MessageIO(socket, _packetSize, debug) {
    (0, _classCallCheck3.default)(this, MessageIO);

    var _this2 = (0, _possibleConstructorReturn3.default)(this, (MessageIO.__proto__ || (0, _getPrototypeOf2.default)(MessageIO)).call(this));

    _this2.socket = socket;
    _this2._packetSize = _packetSize;
    _this2.debug = debug;
    _this2.sendPacket = _this2.sendPacket.bind(_this2);

    _this2.packetStream = new ReadablePacketStream();
    _this2.packetStream.on('data', function (packet) {
      _this2.logPacket('Received', packet);
      _this2.emit('data', packet.data());
      if (packet.isLast()) {
        _this2.emit('message');
      }
    });

    _this2.socket.pipe(_this2.packetStream);
    _this2.packetDataSize = _this2._packetSize - packetHeaderLength;
    return _this2;
  }

  (0, _createClass3.default)(MessageIO, [{
    key: 'packetSize',
    value: function packetSize(_packetSize2) {
      if (arguments.length > 0) {
        this.debug.log('Packet size changed from ' + this._packetSize + ' to ' + _packetSize2);
        this._packetSize = _packetSize2;
        this.packetDataSize = this._packetSize - packetHeaderLength;
      }
      return this._packetSize;
    }
  }, {
    key: 'startTls',
    value: function startTls(credentialsDetails, hostname, trustServerCertificate) {
      var _this3 = this;

      var credentials = tls.createSecureContext ? tls.createSecureContext(credentialsDetails) : crypto.createCredentials(credentialsDetails);

      this.securePair = tls.createSecurePair(credentials);
      this.tlsNegotiationComplete = false;

      this.securePair.on('secure', function () {
        var cipher = _this3.securePair.cleartext.getCipher();

        if (!trustServerCertificate) {
          var verifyError = _this3.securePair.ssl.verifyError();

          // Verify that server's identity matches it's certificate's names
          if (!verifyError) {
            verifyError = tls.checkServerIdentity(hostname, _this3.securePair.cleartext.getPeerCertificate());
          }

          if (verifyError) {
            _this3.securePair.destroy();
            _this3.socket.destroy(verifyError);
            return;
          }
        }

        _this3.debug.log('TLS negotiated (' + cipher.name + ', ' + cipher.version + ')');
        _this3.emit('secure', _this3.securePair.cleartext);
        _this3.encryptAllFutureTraffic();
      });

      this.securePair.encrypted.on('data', function (data) {
        _this3.sendMessage(TYPE.PRELOGIN, data);
      });

      // On Node >= 0.12, the encrypted stream automatically starts spewing out
      // data once we attach a `data` listener. But on Node <= 0.10.x, this is not
      // the case. We need to kick the cleartext stream once to get the
      // encrypted end of the secure pair to emit the TLS handshake data.
      this.securePair.cleartext.write('');
    }
  }, {
    key: 'encryptAllFutureTraffic',
    value: function encryptAllFutureTraffic() {
      this.socket.unpipe(this.packetStream);
      this.securePair.encrypted.removeAllListeners('data');
      this.socket.pipe(this.securePair.encrypted);
      this.securePair.encrypted.pipe(this.socket);
      this.securePair.cleartext.pipe(this.packetStream);
      this.tlsNegotiationComplete = true;
    }
  }, {
    key: 'tlsHandshakeData',
    value: function tlsHandshakeData(data) {
      this.securePair.encrypted.write(data);
    }

    // TODO listen for 'drain' event when socket.write returns false.
    // TODO implement incomplete request cancelation (2.2.1.6)

  }, {
    key: 'sendMessage',
    value: function sendMessage(packetType, data, resetConnection) {
      var numberOfPackets = void 0;
      if (data) {
        numberOfPackets = Math.floor((data.length - 1) / this.packetDataSize) + 1;
      } else {
        numberOfPackets = 1;
        data = new Buffer(0);
      }

      for (var packetNumber = 0; packetNumber < numberOfPackets; packetNumber++) {
        var payloadStart = packetNumber * this.packetDataSize;

        var payloadEnd = void 0;
        if (packetNumber < numberOfPackets - 1) {
          payloadEnd = payloadStart + this.packetDataSize;
        } else {
          payloadEnd = data.length;
        }

        var packetPayload = data.slice(payloadStart, payloadEnd);

        var packet = new Packet(packetType);
        packet.last(packetNumber === numberOfPackets - 1);
        packet.resetConnection(resetConnection);
        packet.packetId(packetNumber + 1);
        packet.addData(packetPayload);
        this.sendPacket(packet);
      }
    }
  }, {
    key: 'sendPacket',
    value: function sendPacket(packet) {
      this.logPacket('Sent', packet);
      if (this.securePair && this.tlsNegotiationComplete) {
        this.securePair.cleartext.write(packet.buffer);
      } else {
        this.socket.write(packet.buffer);
      }
    }
  }, {
    key: 'logPacket',
    value: function logPacket(direction, packet) {
      this.debug.packet(direction, packet);
      return this.debug.data(packet);
    }
  }]);
  return MessageIO;
}(EventEmitter);