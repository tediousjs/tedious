// Make local paths accessible.
//require.paths.unshift(__dirname);


/**
 * Module dependencies.
 */
var
  net = require('net'),
  http = require('http'),
  sys = require('sys'),
  buildPacket = require('../src/packet').build,
  buildPreloginPacket = require('../src/prelogin-packet').build,
  type = require('../src/packet').type;

var data = [0x00,         // token - version
              0x00, 0x1A,   // offset
              0x00, 0x06,   // length
            0x01,         // token - encryption
              0x00, 0x20,
              0x00, 0x01,
            0x02,         // token - instance
              0x00, 0x21,
              0x00, 0x01,
            0x03,         // token - thread id
              0x00, 0x22,
              0x00, 0x04,
            0x04,         // token - mars 
              0x00, 0x26,
              0x00, 0x01,
            0xFF,         // token - terminator
            
            0x09, 0x00, 0x00, 0x00,   // version
            0x00, 0x00,               // subbuild
            
            0x02,                     // encryption - not supported
            
            0x00,                     // instance (ascii-z)
            
            0xB8, 0x0D, 0x00, 0x00,   // thread id
            
            0x01                      // mars - on
          ];

/*
 04
 01
 00 2b
 00 00
 01
 00
 
 00
  00 1a
  00 06
 01
  00 20
  00 01
 02
  00 21
  00 01 
 03
  00 22
  00 00
 04
  00 22
  00 01
 ff
 
 0a 32 06 40  version
 00 00        subbuild
 
 01           encryption
 
 00           instance
 
              thread id
 
 01           mars
 
*/

//var buffer = new Buffer(data.length);
//
//for (byte in data) {
//  buffer[byte] = data[byte];
//};

//var buffer = new Buffer(data);

var connection = net.createConnection(1433, host='192.168.1.64');
//console.log(connection);

connection.addListener('connect', function(){
//  connection.write(buffer);
  console.log("OLD : " + buildPacket(type.PRELOGIN, data));
  console.log("NEW : " + buildPreloginPacket());
  var packet = buildPreloginPacket({last: true});
  connection.write(new Buffer(packet));
});

connection.addListener('data', function(data){
  console.log('DATA: ' +  sys.inspect(data));
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

http.createServer(function (request, response) {
  response.writeHead(200, {'Content-Type': 'text/plain'});
  response.end('Hello World\n');
}).listen(3001);

