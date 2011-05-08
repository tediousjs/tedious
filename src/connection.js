var
events = require("events"),
  net = require('net'),
  sys = require('sys'),
  util = require('util'),
  isPacketComplete = require('./packet').isPacketComplete,
  Packet = require('./packet').Packet,
  PreloginPacket = require('./prelogin-packet');

Buffer.prototype.toByteArray = function () { 
  return Array.prototype.slice.call(this, 0);
}

var Connection = function(host, port) {
  var self = this,
      connection,
      packetBuffer = [];

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

module.exports = Connection;