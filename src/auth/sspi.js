const SspiClientApi = require('sspi-client').SspiClientApi;
const Fqdn = require('sspi-client').Fqdn;
const MakeSpn = require('sspi-client').MakeSpn;

class SSPIAuthProvider {
  constructor(connection, options) {
    this.connection = connection;
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
    }

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

module.exports = function(options) {
  return function(connection) {
    return new SSPIAuthProvider(connection, options);
  };
};
