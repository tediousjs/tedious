var
  connection = require('../src/connection');

exports.connect = function(test){
  var con = connection.create('192.168.1.64');
  
  con.on('recv', function (data) {
    console.log('recv ' + data.length);
    test.done();
  });
  
};
