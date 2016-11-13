'use strict';

const Socket = require('net').Socket;
const isIP = require('net').isIP;
const lookupAll = require('dns-lookup-all');

class Connector {
  constructor(options, multiSubnetFailover) {
    this.options = options;
    this.multiSubnetFailover = multiSubnetFailover;
  }

  execute(cb) {
    if (isIP(this.options.host)) {
      this.executeForIP(cb);
    } else {
      this.executeForHostname(cb);
    }
  }

  executeForIP(cb) {
    const socket = new Socket({});
    socket.connect(this.options);

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

      if (this.multiSubnetFailover) {
        this._connectInParallel(addresses, cb);
      } else {
        this._connectInSequence(addresses, cb);
      }
    });
  }

  _connectInSequence(addresses, cb) {
    if (!addresses.length) {
      return cb(new Error('Could not connect (sequence)'));
    }

    const socket = new Socket({});
    const next = addresses.pop();

    socket.connect({
      host: next.address,
      port: this.options.port,
      localAddress: this.options.localAddress
    });

    const onError = () => {
      this._connectInSequence(addresses, cb);
    };
    socket.on('error', onError);
    socket.on('connect', function() {
      this.removeListener('error', onError);
      cb(null, this);
    });
  }

  _connectInParallel(addresses, cb) {
    const sockets = new Array(addresses.length);

    let errorCount = 0;
    const onError = function(err) {
      errorCount += 1;

      if (errorCount === addresses.length) {
        cb(new Error('Could not connect (parallel)'));
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

      cb(null, this);
    };

    for (let i = 0; i < addresses.length; i++) {
      const socket = sockets[i] = new Socket({});
      socket.connect({
        host: addresses[i].address,
        port: this.options.port,
        localAddress: this.options.localAddress
      });

      socket.on('error', onError);
      socket.on('connect', onConnect);
    }
  }
}

module.exports.Connector = Connector;
