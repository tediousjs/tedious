var
  Connection = require('../../src/connection'),
  fs = require('fs');

exports.connect = function(test){
  var config = JSON.parse(fs.readFileSync(__dirname + '/connection.json', 'utf8')),
      connection;
  
  connection = new Connection(config.server, config.userName, config.password, config.options);
  
  test.expect(3);
  
  connection.on('debug', function (message) {
//    console.log(message);
  });

  connection.on('envChange', function (envChange) {
    switch (envChange.type) {
    case 'database':
      test.strictEqual(envChange.newValue, config.options.database);
      test.strictEqual(connection.database, config.options.database);
      break;
    }
  });

  connection.on('authenticated', function () {
    test.ok(true);
    
    test.done();
  });
};
