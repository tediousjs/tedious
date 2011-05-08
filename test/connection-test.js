var
  Connection = require('../src/connection');

exports.connect = function(test){
  var connection = new Connection('192.168.1.64');
  
  connection.on('packet', function (packet) {
    console.log(packet.toString());
    console.log(packet.decodeOptionTokens());
    test.done();
  });
  
};
