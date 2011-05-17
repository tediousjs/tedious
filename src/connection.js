var
events = require("events"),
  net = require('net'),
  sys = require('sys'),
  util = require('util'),
  isPacketComplete = require('./packet').isPacketComplete,
  bufferToArray = require('./buffer-util').toArray,
  Packet = require('./packet').Packet,
  PACKET_TYPE = require('./packet').TYPE,
  ENCRYPT = require('./prelogin-packet').ENCRYPT,
  PreLoginPacket = require('./prelogin-packet').PreLoginPacket,
  LoginPacket = require('./login-packet').LoginPacket,
  TokenDecoder = require('../src/token-decoder').TokenDecoder;

  DEFAULT_PORT = 1433,
  
  STATE = {
    SENT_PRELOGIN: 0,
    SENT_LOGIN: 1,
    LOGGED_IN: 2
  };

var Connection = function(host, port, loginData) {
  var self = this,
      connection,
      packetBuffer = [];

  events.EventEmitter.call(self);
  
  port = port | DEFAULT_PORT;
  self.loginData = loginData;
  self.packetBuffer = [];
  self.env = {};

  self.connection = net.createConnection(port, host);
  
  this.connection.addListener('connect', function() {
    sendPreLoginPacket();
  });
  
  this.connection.addListener('data', function(data) {
    var packet,
        decodedPacket;
    
    self.packetBuffer = self.packetBuffer.concat(bufferToArray(data));

    if (isPacketComplete(self.packetBuffer)) {
      packet = new Packet(self.packetBuffer);
      decodedPacket = packet.decode();

      // Remove the current packet from the buffer.
      self.packetBuffer = self.packetBuffer.slice(8 + decodedPacket.header.length);
      
      logPacket('Received', packet);
      
      switch (self.state) {
      case STATE.SENT_PRELOGIN:
        processPreLoginResponse(packet, decodedPacket);
        break
      case STATE.SENT_LOGIN:
        processLoginResponse(packet, decodedPacket);
        break
      default:
        console.log('Unexpected state ' + self.state);
      }
    }
  });
  
  this.connection.addListener('end', function(){
    console.log('end');
  });
  
  this.connection.addListener('timeout', function(){
    console.log('timeout');
  });
  
  this.connection.addListener('error', function(exception){
    console.log('error: ' + exception);
  });
  
  this.connection.addListener('close', function(had_error){
    console.log('close: ' + had_error);
  });
  
  this.__defineGetter__('database', function() {
    return self.env.database;
  });

  this.__defineGetter__('language', function() {
    return self.env.language;
  });

  this.__defineGetter__('sqlCollation', function() {
    return self.env.sqlCollation;
  });

  function sendPreLoginPacket() {
    var packet = new PreLoginPacket({last: true});
    
    sendPacket(packet);
    self.state = STATE.SENT_PRELOGIN
  }

  function processPreLoginResponse(rawPacket, packet) {
    var preLoginPacket = new PreLoginPacket(rawPacket);
    var dataAsString;
    
    debug(function (log) {
      log(preLoginPacket.dataAsString('  '));
    });
    
    if (packet.header.type !== PACKET_TYPE.TABULAR_RESULT) {
      self.emit('fail', 'Expected TABULAR_RESULT packet in response to PRELOGIN, but received ' + packet.header.type);
    }

    if (packet.header.encryption !== ENCRYPT.NOT_SUP) {
      self.emit('fail', 'Encryption not supported (yet), but response to PRELOGIN specified encryption ' + packet.header.encryption);
    }
    
    sendLoginPacket();
  }

  function processLoginResponse(rawPacket, packet) {
    var decoder = new TokenDecoder();

    if (packet.header.type !== PACKET_TYPE.TABULAR_RESULT) {
      self.emit('fail', 'Expected TABULAR_RESULT packet in response to LOGIN, but received ' + packet.header.type);
    }

    decoder.on('loginAck', function(loginAck) {
      debug(function (log) {
        log('  loginAck : ' + loginAck.progName);
      });
    });

    decoder.on('envChange', function(envChange) {
      debug(function (log) {
        log('  envChange : ' + envChange.type + ' : ' + envChange.oldValue + ' ==> ' + envChange.newValue);
      });
      
      self.env[envChange.type] = envChange.newValue;

      self.emit('envChange', envChange);
    });

    decoder.on('error_', function(error) {
      debug(function (log) {
        log('  error : ' + error.number + ', @' + error.lineNumber + ', ' + error.messageText);
      });
    });

    decoder.on('info', function(info) {
      debug(function (log) {
        log('  info : ' + info.number + ', @' + info.lineNumber + ', ' + info.messageText);
      });
    });

    decoder.on('unknown', function(tokenType) {
      debug(function (log) {
        log('  unknown : ' + tokenType);
      });
    });

    decoder.on('done', function(done) {
      debug(function (log) {
        log('  done : ' + done.status + ', rowCount=' + done.rowCount);
      });

      if (self.state = STATE.SENT_LOGIN) {
        self.emit('authenticated');
      }
      
      self.state = STATE.LOGGED_IN;
    });
    
    decoder.decode(packet.data);
  }

  function sendLoginPacket() {
    var packet = new LoginPacket({last: true}, self.loginData);

    sendPacket(packet);
    self.state = STATE.SENT_LOGIN
  }

  function sendPacket(packet) {
    logPacket('Sent', packet);
    self.connection.write(packet.buffer);
  }

  function logPacket(text, packet) {
    debug(function (log) {
      log(text + ' packet');
      
      log(packet.headerToString('  '));
      log(packet.dataDump('  '));
    });
  }
  
  function debug(debugFunction) {
    if (self.listeners('debug').length > 0) {
      debugFunction(function(text) {
        self.emit('debug', text);
      });
    }
  }
}

util.inherits(Connection, events.EventEmitter);

module.exports = Connection;