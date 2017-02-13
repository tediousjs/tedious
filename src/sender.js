'use strict';

const dgram = require('dgram');
const lookupAll = require('dns-lookup-all');
const net = require('net');

const udpTypeV4 = 'udp4';
const udpTypeV6 = 'udp6';

function getUdpType(ipAddress) {
  if (net.isIPv4(ipAddress)) {
    return udpTypeV4;
  } else {
    return udpTypeV6;
  }
}

function createDgramSocket(udpType, onError, onMessage) {
  const socket = dgram.createSocket(udpType);

  socket.on('error', onError);
  socket.on('message', onMessage);
  return socket;
}

function clearSocket(socket, onError, onMessage) {
  socket.removeListener('error', onError);
  socket.removeListener('message', onMessage);
  socket.close();
}

class Sender {
  constructor(host, port, request) {
    this.host = host;
    this.port = port;
    this.request = request;

    this.socket = null;
    this.onError = null;
    this.onMessage = null;
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
    const onError = function(err) {
      clearSocket(this, onError, onMessage);
      cb(err);
    };

    const onMessage = function(message) {
      clearSocket(this, onError, onMessage);
      cb(null, message);
    };

    this.socket = createDgramSocket(getUdpType(this.host), onError, onMessage);
    this.socket.send(this.request, 0, this.request.length, this.port, this.host);

    this.onError = onError;
    this.onMessage = onMessage;
  }

  // Wrapper for stubbing. Sinon does not have support for stubbing module functions.
  invokeLookupAll(host, cb) {
    lookupAll(host, cb);
  }

  // Wrappers for stubbing creation of Strategy objects. Sinon support for constructors
  // seems limited.
  createParallelSendStrategy(addresses, port, request) {
    return new ParallelSendStrategy(addresses, port, request);
  }

  executeForHostname(cb) {
    this.invokeLookupAll(this.host, (err, addresses) => {
      if (err) {
        return cb(err);
      }

      this.parallelSendStrategy =
        this.createParallelSendStrategy(addresses, this.port, this.request);
      this.parallelSendStrategy.send(cb);
    });
  }

  cancel() {
    if (this.socket) {
      clearSocket(this.socket, this.onError, this.onMessage);
      this.socket = null;
    } else if (this.parallelSendStrategy) {
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

    for (let j = 0; j < this.addresses.length; j++) {
      const udpType = getUdpType(this.addresses[j].address);
      let socket;

      if (udpType === udpTypeV4) {
        if (!this.socketV4) {
          this.socketV4 = createDgramSocket('udp4', onError, onMessage);
        }

        socket = this.socketV4;
      } else {
        if (!this.socketV6) {
          this.socketV6 = createDgramSocket(getUdpType(this.addresses[j].address), onError, onMessage);
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
