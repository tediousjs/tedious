'use strict';

const net = require('net');
const lookupAll = require('dns-lookup-all');

class Connector {
  constructor(options, multiSubnetFailover) {
    this.options = options;
    this.multiSubnetFailover = multiSubnetFailover;
  }

  execute(cb) {
    if (net.isIP(this.options.host)) {
      this.executeForIP(cb);
    } else {
      this.executeForHostname(cb);
    }
  }

  executeForIP(cb) {
    const socket = net.connect(this.options);

    socket.on('error', cb);
    socket.on('connect', function() {
      this.removeListener('error', cb);
      cb(null, this);
    });
  }

  executeForHostname(cb) {
    lookupAll(this.options.host, 4, (err, addresses) => {
      if (err) {
        return cb(err);
      }

      const port = this.options.port;
      const localAddress = this.options.localAddress;

      if (this.multiSubnetFailover) {
        new ParallelConnectionStrategy(addresses, port, localAddress).connect(cb);
      } else {
        new SequentialConnectionStrategy(addresses, port, localAddress).connect(cb);
      }
    });
  }
}

class ParallelConnectionStrategy {
  constructor(addresses, port, localAddress) {
    this.addresses = addresses;
    this.port = port;
    this.localAddress = localAddress;
  }

  connect(callback) {
    const addresses = this.addresses;
    const sockets = new Array(addresses.length);

    let errorCount = 0;
    const onError = function(err) {
      errorCount += 1;

      this.removeListener('error', onError);
      this.removeListener('connect', onConnect);

      if (errorCount === addresses.length) {
        callback(new Error('Could not connect (parallel)'));
        return;
      }
    };

    const onConnect = function() {
      for (let j = 0; j < sockets.length; j++) {
        const socket = sockets[j];

        if (this === socket) {
          continue;
        }

        socket.removeListener('error', onError);
        socket.removeListener('connect', onConnect);
        socket.destroy();
      }

      callback(null, this);
    };

    for (let i = 0, len = addresses.length; i < len; i++) {
      const socket = sockets[i] = net.connect({
        host: addresses[i].address,
        port: this.port,
        localAddress: this.localAddress
      });

      socket.on('error', onError);
      socket.on('connect', onConnect);
    }
  }
}

class SequentialConnectionStrategy {
  constructor(addresses, port, localAddress) {
    this.addresses = addresses;
    this.port = port;
    this.localAddress = localAddress;
  }

  connect(cb) {
    const addresses = this.addresses;

    if (!addresses.length) {
      cb(new Error('Could not connect (sequence)'));
      return;
    }

    const next = addresses.shift();

    const socket = net.connect({
      host: next.address,
      port: this.port,
      localAddress: this.localAddress
    });

    const onError = (err) => {
      socket.removeListener('error', onError);
      socket.removeListener('connect', onConnect);

      this.connect(cb);
    };

    const onConnect = () => {
      socket.removeListener('error', onError);
      socket.removeListener('connect', onConnect);

      cb(null, socket);
    };

    socket.on('error', onError);
    socket.on('connect', onConnect);
  }
}

module.exports.Connector = Connector;
module.exports.ParallelConnectionStrategy = ParallelConnectionStrategy;
module.exports.SequentialConnectionStrategy = SequentialConnectionStrategy;
