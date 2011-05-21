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
//
//exports.connect = function(test){
//  var config = JSON.parse(fs.readFileSync(__dirname + '/connection.json', 'utf8')),
//      connection;
//  
//  connection = new Connection(config.server, config.userName, config.password, config.options);
//  
//  test.expect(3);
//  
//  connection.on('debug', function (message) {
////    console.log(message);
//  });
//
//  connection.on('envChange', function (envChange) {
//    switch (envChange.type) {
//    case 'database':
//      test.strictEqual(envChange.newValue, config.options.database);
//      test.strictEqual(connection.database, config.options.database);
//      break;
//    }
//  });
//
//  connection.on('authenticated', function () {
//    test.ok(true);
//    
//    test.done();
//  });
//};

exports.connectSuccess = function(test){
  var config = JSON.parse(fs.readFileSync(__dirname + '/connection.json', 'utf8')),
      connection;

  test.expect(4);

  connection = new Connection(config.server, config.userName, config.password, config.options, function(err, info) {
    test.ok(!err);

    test.ok(info);
    test.ok(info.infos.length > 0);
    test.strictEqual(info.errors.length, 0);
    
    test.done();
  });
  
  connection.on('debug', function (message) {
//    console.log(message);
  });
//
//  connection.on('envChange', function (envChange) {
//    switch (envChange.type) {
//    case 'database':
//      test.strictEqual(envChange.newValue, config.options.database);
//      test.strictEqual(connection.database, config.options.database);
//      break;
//    }
//  });

//  connection.on('authenticated', function () {
//    test.ok(true);
//    
//    test.done();
//  });
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
    console.log(message);
  });
};
