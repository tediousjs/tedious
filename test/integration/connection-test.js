var
  Connection = require('../../src/connection');

exports.connect = function(test){
  var database = 'test',
      connection = new Connection('192.168.1.64', 'test', 'test', {
        port: 1433,
        database: database
      });

  test.expect(3);
  
  connection.on('debug', function (message) {
//    console.log(message);
  });

  connection.on('envChange', function (envChange) {
    switch (envChange.type) {
    case 'database':
      test.strictEqual(envChange.newValue, database);
      test.strictEqual(connection.database, database);
      break;
    }
  });

  connection.on('authenticated', function () {
    test.ok(true);
    
    test.done();
  });
};
