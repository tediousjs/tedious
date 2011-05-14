var
  Connection = require('../src/connection');

exports.connect = function(test){
  var connection = new Connection('192.168.1.64', 1433, {
        userName: 'test',
        password: ''
      }),
      packetCount = 0;
  
  connection.on('packet', function (packet) {
    console.log(packet.toString());
    console.log(packet.decodeOptionTokens());
    
    packetCount++;
    
    if (packetCount === 2) {
      test.done();
    }
  });
  
};
