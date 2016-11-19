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

    const onError = (err) => {
      socket.removeListener('error', onError);
      socket.removeListener('connect', onConnect);

      socket.destroy();

      cb(err);
    };

    const onConnect = () => {
      socket.removeListener('error', onError);
      socket.removeListener('connect', onConnect);

      cb(null, socket);
    };

    socket.on('error', onError);
    socket.on('connect', onConnect);
  }

  executeForHostname(cb) {
    lookupAll(this.options.host, (err, addresses) => {
      if (err) {
        return cb(err);
      }

      if (this.multiSubnetFailover) {
        new ParallelConnectionStrategy(addresses, this.options).connect(cb);
      } else {
        new SequentialConnectionStrategy(addresses, this.options).connect(cb);
      }
    });
  }
}

class ParallelConnectionStrategy {
  constructor(addresses, options) {
    this.addresses = addresses;
    this.options = options;
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
      const socket = sockets[i] = net.connect(Object.create(this.options, {
        host: { value: addresses[i].address }
      }));

      socket.on('error', onError);
      socket.on('connect', onConnect);
    }
  }
}

class SequentialConnectionStrategy {
  constructor(addresses, options) {
    this.addresses = addresses;
    this.options = options;
  }

  connect(callback) {
    const addresses = this.addresses;

    if (!addresses.length) {
      callback(new Error('Could not connect (sequence)'));
      return;
    }

    const next = addresses.shift();

    const socket = net.connect(Object.create(this.options, {
      host: { value: next.address }
    }));

    const onError = (err) => {
      socket.removeListener('error', onError);
      socket.removeListener('connect', onConnect);

      socket.destroy();

      this.connect(callback);
    };

    const onConnect = () => {
      socket.removeListener('error', onError);
      socket.removeListener('connect', onConnect);

      callback(null, socket);
    };

    socket.on('error', onError);
    socket.on('connect', onConnect);
  }
}

module.exports.Connector = Connector;
module.exports.ParallelConnectionStrategy = ParallelConnectionStrategy;
module.exports.SequentialConnectionStrategy = SequentialConnectionStrategy;
