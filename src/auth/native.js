const { SspiClientApi, Fqdn, MakeSpn } = require('sspi-client');

class NativeAuthProvider {
  constructor(connection, options) {
    this.connection = connection;
    this.options = options;

    this.client = undefined;
  }

  handshake(data, callback) {
    if (this.sspiClientResponsePending) {
      // We got data from the server while we're waiting for getNextBlob()
      // call to complete on the client. We cannot process server data
      // until this call completes as the state can change on completion of
      // the call. Queue it for later.
      const boundDispatchEvent = this.connection.dispatchEvent.bind(this.connection);
      return setImmediate(boundDispatchEvent, 'message');
    }

    if (data) {
      this.sspiClientResponsePending = true;
      return this.client.getNextBlob(data, 0, data.length, (responseBuffer, isDone, errorCode, errorString) => {
        if (errorCode) {
          return callback(new Error(errorString));
        }
        this.sspiClientResponsePending = false;
        callback(null, responseBuffer);
      });
    }
    else {
      const server = this.connection.routingData ? this.connection.routingData.server : this.connection.config.server;
      Fqdn.getFqdn(server, (err, fqdn) => {
        if (err) {
          return callback(new Error('Error getting Fqdn. Error details: ' + err.message));
        }

        const spn = MakeSpn.makeSpn('MSSQLSvc', fqdn, this.connection.config.options.port);
        this.client = new SspiClientApi.SspiClient(spn, this.connection.config.securityPackage);
        this.sspiClientResponsePending = true;
        this.client.getNextBlob(null, 0, 0, (responseBuffer, isDone, errorCode, errorString) => {
          if (errorCode) {
            return callback(new Error(errorString));
          }

          if (isDone) {
            return callback(new Error('Unexpected isDone=true on getNextBlob in sendLogin7Packet.'));
          }
          this.sspiClientResponsePending = false;
          callback(null, responseBuffer);
        });
      });
    }
  }
}

module.exports = function(options) {
  return function(connection) {
    return new NativeAuthProvider(connection, options);
  };
};

module.exports.NativeAuthProvider = NativeAuthProvider;
