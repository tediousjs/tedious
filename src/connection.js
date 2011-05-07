var
  net = require('net'),
  sys = require('sys'),
  buildPreloginPacket = require('./prelogin-packet').build,
  events = require("events"),
  peekPacketLength = require('./packet').peekPacketLength,
  packetToString = require('./packet').toString;

Buffer.prototype.toByteArray = function () { 
  return Array.prototype.slice.call(this, 0);
}

exports.create = function(host, port) {
  port = port | 1433;
  var connection = net.createConnection(port, host);
  
  var packetBuffer = [];
  
  connection.addListener('connect', function(){
    var packet = buildPreloginPacket({last: true});
    connection.write(new Buffer(packet));
  });
  
  connection.addListener('data', function(data){
    console.log('DATA: ' +  sys.inspect(data));
    
    packetBuffer = packetBuffer.concat(data.toByteArray());
    var packetLength = peekPacketLength(packetBuffer);
    if (packetLength) {
      var packetData = packetBuffer.slice(0, packetLength);
      console.log(packetToString(packetData));
      emitter.emit('recv', data);
      
      packetBuffer = packetBuffer.slice(packetLength);
      console.log(packetBuffer.length);
    }
  });
  
  connection.addListener('end', function(){
    console.log('end');
  });
  
  connection.addListener('timeout', function(){
    console.log('timeout');
  });
  
  connection.addListener('drain', function(){
    console.log('drain');
  });
  
  connection.addListener('error', function(exception){
    console.log('error: ' + exception);
  });
  
  connection.addListener('close', function(had_error){
    console.log('close: ' + had_error);
  });

  var emitter = new events.EventEmitter();
  
  function on(event, listener) {
    emitter.on(event, listener);
  }
  
  return {
    on: on
  }
}
