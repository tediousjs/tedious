const { SspiClientApi, Fqdn, MakeSpn } = require('sspi-client');

/**
  Authenticate to SQL Server via Windows Native SSPI.

  This class allows authentication to SQL Server via native APIs provided
  by Windows. This allows client authentication without providing a
  username/password.
*/
class NativeAuthProvider {
  constructor(connection, options) {
    this.connection = connection;
    this.options = options;

    this.client = undefined;
  }

  handshake(data, callback) {
    if (data) {
      return this.client.getNextBlob(data, 0, data.length, (responseBuffer, isDone, errorCode, errorString) => {
        if (errorCode) {
          return callback(new Error(errorString));
        }

        callback(null, responseBuffer);
      });
    } else {
      const server = this.connection.routingData ? this.connection.routingData.server : this.connection.config.server;

      Fqdn.getFqdn(server, (err, fqdn) => {
        if (err) {
          return callback(new Error('Error getting Fqdn. Error details: ' + err.message));
        }

        const spn = MakeSpn.makeSpn('MSSQLSvc', fqdn, this.connection.config.options.port);
        this.client = new SspiClientApi.SspiClient(spn, this.options.securityPackage);
        this.client.getNextBlob(null, 0, 0, (responseBuffer, isDone, errorCode, errorString) => {
          if (errorCode) {
            return callback(new Error(errorString));
          }

          if (isDone) {
            return callback(new Error('Unexpected isDone=true on getNextBlob in sendLogin7Packet.'));
          }

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
