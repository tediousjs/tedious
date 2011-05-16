var
  Connection = require('../src/connection');

exports.connect = function(test){
  var connection = new Connection('192.168.1.64', 1433, {
        userName: 'test',
        password: 'test'
      }),
      packetCount = 0;

  connection.on('debug', function (message) {
    //console.log(message);
  });

  connection.on('packet', function (packet) {
    packetCount++;
    
    if (packetCount === 2) {
      test.done();
    }
  });
  
};
