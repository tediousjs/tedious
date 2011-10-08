var ENCRYPT = require('./prelogin-packet').ENCRYPT,
    PACKET_TYPE = require('./packet').TYPE;

function Prelogin(connection) {
  this.connection = connection;
}

Prelogin.prototype.sendRequest = function() {
  var packet = new PreLoginPacket({last: true});
  
  connection.sendPacket(packet);

  // Belongs in caller (Connection).
//  self.state = STATE.SENT_PRELOGIN
};

Prelogin.prototype.processResponse = function(rawPacket, packet) {
  var preLoginPacket = new PreLoginPacket(rawPacket);
  var dataAsString;
  
  connection.debug(function (log) {
    connection.log(preLoginPacket.dataAsString('  '));
  });
  
  if (packet.header.type !== PACKET_TYPE.TABULAR_RESULT) {
    connection.endRequest('Expected TABULAR_RESULT packet in response to PRELOGIN, but received ' + packet.header.type);
    return;
  }

  if (packet.header.encryption && packet.header.encryption !== ENCRYPT.OFF) {
    connection.endRequest('Encryption not supported (yet), but response to PRELOGIN specified encryption ' + packet.header.encryption);
    return;
  }
  
  // Belongs in caller (Connection).
//  connection.sendLoginPacket();
};

module.exports = Prelogin;
