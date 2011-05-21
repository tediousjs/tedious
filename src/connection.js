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
  TokenDecoder = require('../src/token-decoder').TokenDecoder,
  DONE_STATUS = require('./token').DONE_STATUS;

  DEFAULT_PORT = 1433,
  
  STATE = {
    SENT_PRELOGIN: 0,
    SENT_LOGIN: 1,
    LOGGED_IN: 2
  };

var Connection = function(server, userName, password, options, callback) {
  var self = this,
      connection,
      packetBuffer = [];

  events.EventEmitter.call(self);

  options = options || {};
    
  self.server = server;
  self.port = options.port | DEFAULT_PORT;
  
  self.loginData = {};
  self.loginData.userName = userName;
  self.loginData.password = password;
  self.loginData.database = options.database;
  self.loginData.language = options.language;
  self.loginData.appName = options.appName;
  self.loginData.serverName = server;

  self.packetBuffer = [];
  self.env = {};
  self.closed = false;
  self.activeRequest = {
      info: {
        infos: [],
        errors: [],
        envChanges: []
      },
    callback: callback
  };

  self.connection = net.createConnection(self.port, self.server);
  
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
    debug(function (log) {
      log(exception);
    });

    self.activeRequest.callback(exception, self.activeRequest.info);
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
      safeEmit('fail', 'Expected TABULAR_RESULT packet in response to PRELOGIN, but received ' + packet.header.type);
    }

    if (packet.header.encryption !== ENCRYPT.NOT_SUP) {
      safeEmit('fail', 'Encryption not supported (yet), but response to PRELOGIN specified encryption ' + packet.header.encryption);
    }
    
    sendLoginPacket();
  }

  function processLoginResponse(rawPacket, packet) {
    var decoder = new TokenDecoder();

    if (packet.header.type !== PACKET_TYPE.TABULAR_RESULT) {
      safeEmit('fail', 'Expected TABULAR_RESULT packet in response to LOGIN, but received ' + packet.header.type);
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
      self.activeRequest.info.envChanges.push(envChange);

      safeEmit('envChange', envChange);
    });

    decoder.on('error_', function(error) {
      debug(function (log) {
        log('  error : ' + error.number + ', @' + error.lineNumber + ', ' + error.messageText);
        self.activeRequest.info.errors.push(error);
      });
    });

    decoder.on('info', function(info) {
      debug(function (log) {
        log('  info : ' + info.number + ', @' + info.lineNumber + ', ' + info.messageText);
        self.activeRequest.info.infos.push(info);
      });
    });

    decoder.on('unknown', function(tokenType) {
      debug(function (log) {
        log('  unknown token type : ' + tokenType);
        self.activeRequest.callback('unknown token type received : ' + tokenType, self.activeRequest.info);
      });
    });

    decoder.on('done', function(done) {
      var request = self.activeRequest;

      debug(function (log) {
        log('  done : ' + done.statusText + '(' + done.status + '), rowCount=' + done.rowCount);
      });

      if (done.status === DONE_STATUS.ERROR || done.status === DONE_STATUS.SRVERROR) {
        request.callback('Error executing request', request.info);
      } else {
        request.callback(undefined, request.info);
      }

      if (self.state = STATE.SENT_LOGIN) {
        self.state = STATE.LOGGED_IN;
      }
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
        safeEmit('debug', text);
      });
    }
  }
  
  function safeEmit() {
    if (!self.closed) {
      self.emit.apply(self, arguments);
    }
  }
}

util.inherits(Connection, events.EventEmitter);

Connection.prototype.close = function() {
  this.closed = true;
  this.connection.destroy();
}

module.exports = Connection;