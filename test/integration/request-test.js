var
  Connection = require('../../src/connection'),
  fs = require('fs');

exports.request = function(test){
  var config = JSON.parse(fs.readFileSync(__dirname + '/connection.json', 'utf8')),
      connection;

  test.expect(2);

  connection = new Connection(config.server, config.userName, config.password, config.options, function(err, info) {
    test.ok(!err);

    connection.execProc(function (err, info) {
      test.ok(!err);

      test.done();
    });
  });
  
  connection.on('debug', function (message) {
    console.log(message);
  });
};
