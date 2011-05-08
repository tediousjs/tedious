var
events = require("events"),
  net = require('net'),
  sys = require('sys'),
  util = require('util'),
  isPacketComplete = require('./packet').isPacketComplete,
  Packet = require('./packet').Packet,
  PACKET_TYPE = require('./packet').TYPE,
  PreloginPacket = require('./prelogin-packet').PreLoginPacket,
  ENCRYPT = require('./prelogin-packet').ENCRYPT;

Buffer.prototype.toByteArray = function () { 
  return Array.prototype.slice.call(this, 0);
}

var Connection = function(host, port) {
  var self = this,
      connection,
      packetBuffer = [],
      packetProcessFunction = expectPreLoginResponse;

  events.EventEmitter.call(self);
  
  port = port | 1433;
  connection = net.createConnection(port, host);
  
  connection.addListener('connect', function() {
    sendPreloginPacket();
  });
  
  connection.addListener('data', function(data) {
    var packet;
    
    console.log('DATA: ' +  sys.inspect(data));
    
    packetBuffer = packetBuffer.concat(data.toByteArray());
    if (isPacketComplete(packetBuffer)) {
      packet = new Packet(packetBuffer);
      self.emit('packet', packet);
      
      packetProcessFunction.call(self, packet.decode());
    }
  });
  
  connection.addListener('end', function(){
    console.log('end');
  });
  
  connection.addListener('timeout', function(){
    console.log('timeout');
  });
  
  connection.addListener('error', function(exception){
    console.log('error: ' + exception);
  });
  
  connection.addListener('close', function(had_error){
    console.log('close: ' + had_error);
  });

  function sendPreloginPacket() {
    var packet = new PreloginPacket({last: true});
    connection.write(packet.buffer);
  }
}

util.inherits(Connection, events.EventEmitter);

function expectPreLoginResponse(packet) {
  if (packet.header.type !== PACKET_TYPE.TABULAR_RESULT) {
    this.emit('fail', 'Expected TABULAR_RESULT packet in response to PRELOGIN, but received ' + packet.header.type);
  }

  if (packet.header.encryption !== ENCRYPT.NOT_SUP) {
    this.emit('fail', 'Encryption not supported (yet), but response to PRELOGIN specified encryption ' + packet.header.encryption);
  }
}

module.exports = Connection;