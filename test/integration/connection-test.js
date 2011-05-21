var
  Connection = require('../../src/connection'),
  fs = require('fs');

exports.debug = function(test){
  var config = JSON.parse(fs.readFileSync(__dirname + '/connection.json', 'utf8')),
      connection = new Connection(config.server, config.userName, config.password, config.options);
  
  test.expect(1);
  
  connection.on('debug', function (message) {
    test.ok(message);
    connection.close();

    test.done();
  });
};

exports.connectSuccess = function(test){
  var config = JSON.parse(fs.readFileSync(__dirname + '/connection.json', 'utf8')),
      connection;

  test.expect(7);

  connection = new Connection(config.server, config.userName, config.password, config.options, function(err, info) {
    test.ok(!err);

    test.ok(info);
    
    test.ok(info.infos.length > 0);
    test.strictEqual(info.errors.length, 0);
    
    test.ok(info.envChanges.length > 0);
    info.envChanges.forEach(function(envChange) {
      if (envChange.type === 'database') {
        test.strictEqual(envChange.newValue, config.options.database);
      }
    });

    test.strictEqual(connection.database, config.options.database);

    test.done();
  });
  
  connection.on('debug', function (message) {
//    console.log(message);
  });
};

exports.connectBadServer = function(test){
  var config = JSON.parse(fs.readFileSync(__dirname + '/connection.json', 'utf8')),
      connection;

  test.expect(1);

  connection = new Connection('bad', config.userName, config.password, config.options, function(err, info) {
    test.ok(err);
    
    test.done();
  });
  
  connection.on('debug', function (message) {
//    console.log(message);
  });
};

exports.connectBadLoginCredentials = function(test){
  var config = JSON.parse(fs.readFileSync(__dirname + '/connection.json', 'utf8')),
      connection;

  test.expect(2);

  connection = new Connection(config.server, 'bad', 'bad', config.options, function(err, info) {
    test.ok(err);
    test.ok(info.errors.length > 0);
    
    test.done();
  });
  
  connection.on('debug', function (message) {
//    console.log(message);
  });
};
