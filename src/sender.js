const dgram = require('dgram');
const dns = require('dns');
const net = require('net');
const punycode = require('punycode');

class Sender {
  constructor(host, port, request, serverNameAsACE) {
    this.host = host;
    this.port = port;
    this.request = request;
    this.serverNameAsACE = serverNameAsACE;

    this.parallelSendStrategy = null;
  }

  execute(cb) {
    if (net.isIP(this.host)) {
      this.executeForIP(cb);
    } else {
      this.executeForHostname(cb);
    }
  }

  executeForIP(cb) {
    this.executeForAddresses([{ address: this.host }], cb);
  }

  // Wrapper for stubbing. Sinon does not have support for stubbing module functions.
  invokeLookupAll(host, cb) {
    const serverName = this.serverNameAsACE ? (punycode.toASCII(host)).trim() : host;
    dns.lookup(serverName, { all: true }, cb);
  }

  executeForHostname(cb) {
    this.invokeLookupAll(this.host, (err, addresses) => {
      if (err) {
        return cb(err);
      }

      this.executeForAddresses(addresses, cb);
    });
  }

  // Wrapper for stubbing creation of Strategy object. Sinon support for constructors
  // seems limited.
  createParallelSendStrategy(addresses, port, request) {
    return new ParallelSendStrategy(addresses, port, request);
  }

  executeForAddresses(addresses, cb) {
    this.parallelSendStrategy =
      this.createParallelSendStrategy(addresses, this.port, this.request);
    this.parallelSendStrategy.send(cb);
  }

  cancel() {
    if (this.parallelSendStrategy) {
      this.parallelSendStrategy.cancel();
    }
  }
}

class ParallelSendStrategy {
  constructor(addresses, port, request) {
    this.addresses = addresses;
    this.port = port;
    this.request = request;

    this.socketV4 = null;
    this.socketV6 = null;
    this.onError = null;
    this.onMessage = null;
  }

  clearSockets() {
    const clearSocket = (socket, onError, onMessage) => {
      socket.removeListener('error', onError);
      socket.removeListener('message', onMessage);
      socket.close();
    };

    if (this.socketV4) {
      clearSocket(this.socketV4, this.onError, this.onMessage);
      this.socketV4 = null;
    }

    if (this.socketV6) {
      clearSocket(this.socketV6, this.onError, this.onMessage);
      this.socketV6 = null;
    }
  }

  send(cb) {
    let errorCount = 0;

    const onError = (err) => {
      errorCount++;

      if (errorCount === this.addresses.length) {
        this.clearSockets();
        cb(err);
      }
    };

    const onMessage = (message) => {
      this.clearSockets();
      cb(null, message);
    };

    const createDgramSocket = (udpType, onError, onMessage) => {
      const socket = dgram.createSocket(udpType);

      socket.on('error', onError);
      socket.on('message', onMessage);
      return socket;
    };

    for (let j = 0; j < this.addresses.length; j++) {
      const udpTypeV4 = 'udp4';
      const udpTypeV6 = 'udp6';

      const udpType = net.isIPv4(this.addresses[j].address) ? udpTypeV4 : udpTypeV6;
      let socket;

      if (udpType === udpTypeV4) {
        if (!this.socketV4) {
          this.socketV4 = createDgramSocket(udpTypeV4, onError, onMessage);
        }

        socket = this.socketV4;
      } else {
        if (!this.socketV6) {
          this.socketV6 = createDgramSocket(udpTypeV6, onError, onMessage);
        }

        socket = this.socketV6;
      }

      socket.send(this.request, 0, this.request.length, this.port, this.addresses[j].address);
    }

    this.onError = onError;
    this.onMessage = onMessage;
  }

  cancel() {
    this.clearSockets();
  }
}

module.exports.Sender = Sender;
module.exports.ParallelSendStrategy = ParallelSendStrategy;
