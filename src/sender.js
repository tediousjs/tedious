'use strict';

const dgram = require('dgram');
const lookupAll = require('dns-lookup-all');
const net = require('net');

function sendDgramSocketRequest(ipAddress, port, request, onError, onMessage) {
  let ipType;

  if (net.isIPv4(ipAddress)) {
    ipType = 'udp4';
  } else {
    ipType = 'udp6';
  }

  const socket = dgram.createSocket(ipType);

  socket.on('error', onError);
  socket.on('message', onMessage);
  socket.send(request, 0, request.length, port, ipAddress);

  return socket;
}

function clearSocket(socket, onError, onMessage) {
  socket.removeListener('error', onError);
  socket.removeListener('message', onMessage);
  socket.close();
}

class Sender {
  constructor(host, port, request, multiSubnetFailover) {
    this.host = host;
    this.port = port;
    this.request = request;
    this.multiSubnetFailover = multiSubnetFailover;

    this.socket = null;
    this.onError = null;
    this.onMessage = null;
    this.parallelSendStrategy = null;
    this.sequentialSendStrategy = null;
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

    this.socket = sendDgramSocketRequest(this.host, this.port, this.request, onError, onMessage);

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

  createSequentialSendStrategy(addresses, port, request) {
    return new SequentialSendStrategy(addresses, port, request);
  }

  executeForHostname(cb) {
    this.invokeLookupAll(this.host, (err, addresses) => {
      if (err) {
        return cb(err);
      }

      if (this.multiSubnetFailover) {
        this.parallelSendStrategy =
          this.createParallelSendStrategy(addresses, this.port, this.request);
        this.parallelSendStrategy.send(cb);
      } else {
        this.sequentialSendStrategy =
          this.createSequentialSendStrategy(addresses, this.port, this.request);
        this.sequentialSendStrategy.send(cb);
      }
    });
  }

  cancel() {
    if (this.socket) {
      clearSocket(this.socket, this.onError, this.onMessage);
      this.socket = null;
    } else if (this.parallelSendStrategy) {
      this.parallelSendStrategy.cancel();
    } else if (this.sequentialSendStrategy) {
      this.sequentialSendStrategy.cancel();
    }
  }
}

class ParallelSendStrategy {
  constructor(addresses, port, request) {
    this.addresses = addresses;
    this.port = port;
    this.request = request;

    this.sockets = new Array(addresses.length);
    this.onError = null;
    this.onMessage = null;
  }

  send(cb) {
    const that = this;

    let errorCount = 0;
    const onError = function(err) {
      clearSocket(this, onError, onMessage);

      for (let j = 0; j < that.sockets.length; j++) {
        if (that.sockets[j] === this) {
          that.sockets[j] = null;
          break;
        }
      }

      errorCount += 1;
      if (errorCount === that.addresses.length) {
        cb(err);
      }
    };

    const onMessage = function(message) {
      for (let j = 0; j < that.sockets.length; j++) {
        if (that.sockets[j]) {
          clearSocket(that.sockets[j], onError, onMessage);
          that.sockets[j] = null;
        }
      }

      cb(null, message);
    };

    for (let j = 0; j < this.addresses.length; j++) {
      this.sockets[j] = sendDgramSocketRequest(this.addresses[j].address, this.port, this.request, onError, onMessage);
    }

    this.onError = onError;
    this.onMessage = onMessage;
  }

  cancel() {
    for (let j = 0; j < this.sockets.length; j++) {
      if (this.sockets[j]) {
        clearSocket(this.sockets[j], this.onError, this.onMessage);
        this.sockets[j] = null;
      }
    }
  }
}

class SequentialSendStrategy {
  constructor(addresses, port, request) {
    this.addresses = addresses;
    this.port = port;
    this.request = request;

    this.socket = null;
    this.onError = null;
    this.onMessage = null;
    this.next = 0;
  }

  send(cb) {
    const that = this;

    const onError = function(err) {
      clearSocket(this, onError, onMessage);
      that.socket = null;

      if (that.addresses.length > that.next) {
        that.send(cb);
      } else {
        cb(err);
      }
    };

    const onMessage = function(message) {
      clearSocket(this, onError, onMessage);
      that.socket = null;
      cb(null, message);
    };

    this.socket = sendDgramSocketRequest(
      this.addresses[this.next].address, this.port, this.request, onError, onMessage);
    this.next++;

    this.onError = onError;
    this.onMessage = onMessage;
  }

  cancel() {
    if (this.socket) {
      clearSocket(this.socket, this.onError, this.onMessage);
      this.socket = null;
    }
  }
}

module.exports.Sender = Sender;
module.exports.ParallelSendStrategy = ParallelSendStrategy;
module.exports.SequentialSendStrategy = SequentialSendStrategy;
