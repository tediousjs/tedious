var
events = require("events"),
  net = require('net'),
  sys = require('sys'),
  util = require('util'),
  isPacketComplete = require('./packet').isPacketComplete,
  Packet = require('./packet').Packet,
  PACKET_TYPE = require('./packet').TYPE,
  PreLoginPacket = require('./prelogin-packet').PreLoginPacket,
  ENCRYPT = require('./prelogin-packet').ENCRYPT;
  LoginPacket = require('./login-packet').LoginPacket,

Buffer.prototype.toByteArray = function () { 
  return Array.prototype.slice.call(this, 0);
}

var Connection = function(host, port, loginData) {
  var self = this,
      connection,
      packetBuffer = [];

  events.EventEmitter.call(self);
  
  port = port | 1433;
  self.connection = net.createConnection(port, host);
  self.loginData = loginData;
  
  this.connection.addListener('connect', function() {
    self.packetProcessFunction = expectPreLoginResponse;
    sendPreLoginPacket.call();
  });
  
  this.connection.addListener('data', function(data) {
    var packet;
    
    console.log('DATA: ' +  sys.inspect(data));
    
    packetBuffer = packetBuffer.concat(data.toByteArray());
    if (isPacketComplete(packetBuffer)) {
      packet = new Packet(packetBuffer);
      self.emit('packet', packet);
      
      self.packetProcessFunction(packet.decode());
    }
  });
  
  this.connection.addListener('end', function(){
    console.log('end');
  });
  
  this.connection.addListener('timeout', function(){
    console.log('timeout');
  });
  
  this.connection.addListener('error', function(exception){
    console.log('error: ' + exception);
  });
  
  this.connection.addListener('close', function(had_error){
    console.log('close: ' + had_error);
  });

  function sendPreLoginPacket() {
    var packet = new PreLoginPacket({last: true});
    
    self.connection.write(packet.buffer);
  }

  function expectPreLoginResponse(packet) {
    if (packet.header.type !== PACKET_TYPE.TABULAR_RESULT) {
      self.emit('fail', 'Expected TABULAR_RESULT packet in response to PRELOGIN, but received ' + packet.header.type);
    }

    if (packet.header.encryption !== ENCRYPT.NOT_SUP) {
      self.emit('fail', 'Encryption not supported (yet), but response to PRELOGIN specified encryption ' + packet.header.encryption);
    }
    
    self.packetProcessFunction = expectLoginResponse;
    sendLoginPacket();
  }

  function expectLoginResponse(packet) {
    if (packet.header.type !== PACKET_TYPE.TABULAR_RESULT) {
      self.emit('fail', 'Expected TABULAR_RESULT packet in response to LOGIN, but received ' + packet.header.type);
    }
  }

  function sendLoginPacket() {
    var packet = new LoginPacket({last: true}, self.loginData);

    console.log(packet.toString());
    self.connection.write(packet.buffer);
  }
}

util.inherits(Connection, events.EventEmitter);

module.exports = Connection;