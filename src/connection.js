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
  self.state = false;

  startRequest('connect/login', callback);
  
  self.connection = new net.Socket({});
  self.connection.setTimeout(1000);
  self.connection.connect(self.port, self.server);
  
  this.connection.addListener('connect', function connectEvent() {
    sendPreLoginPacket();
  });
  
  this.connection.addListener('data', function dataEvent(data) {
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
        requestEnd('Unexpected state ' + self.state);
      }
    }
  });
  
  this.connection.addListener('end', function endEvent(){
  });
  
  this.connection.addListener('timeout', function timeoutEvent(){
    debug(function (log) {
      log('timeout');
    });

    endRequest('Socket timeout');
  });
  
  this.connection.addListener('error', function errorEvent(exception){
    debug(function (log) {
      log(exception);
    });

    endRequest(exception);
  });
  
  this.connection.addListener('close', function closeEvent(had_error){
//    console.log('close: ' + had_error);
  });
  
  this.__defineGetter__('database', function getDatabase() {
    return self.env.database;
  });

  this.__defineGetter__('language', function getLanguage() {
    return self.env.language;
  });

  this.__defineGetter__('sqlCollation', function getSqlCollation() {
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
      endRequest('Expected TABULAR_RESULT packet in response to PRELOGIN, but received ' + packet.header.type);
      return;
    }

    if (packet.header.encryption && packet.header.encryption !== ENCRYPT.OFF) {
      endRequest('Encryption not supported (yet), but response to PRELOGIN specified encryption ' + packet.header.encryption);
      return;
    }
    
    sendLoginPacket();
  }

  function processLoginResponse(rawPacket, packet) {
    var decoder = new TokenDecoder();

    if (packet.header.type !== PACKET_TYPE.TABULAR_RESULT) {
      endRequest('Expected TABULAR_RESULT packet in response to LOGIN, but received ' + packet.header.type);
      return;
    }

    decoder.on('loginAck', function loginAckEvent(loginAck) {
      debug(function (log) {
        log('  loginAck : ' + loginAck.progName + ' ' + loginAck.progVersion.string);
        
        self.activeRequest.loginAck = true;
      });
    });

    decoder.on('envChange', function envChangeEvent(envChange) {
      debug(function (log) {
        log('  envChange : ' + envChange.type + ' : ' + envChange.oldValue + ' ==> ' + envChange.newValue);
      });
      
      self.env[envChange.type] = envChange.newValue;
      self.activeRequest.info.envChanges.push(envChange);
    });

    decoder.on('error_', function errorEvent(error) {
      debug(function (log) {
        log('  error : ' + error.number + ', @' + error.lineNumber + ', ' + error.messageText);
        self.activeRequest.info.errors.push(error);
      });
    });

    decoder.on('info', function infoEvent(info) {
      debug(function (log) {
        log('  info : ' + info.number + ', @' + info.lineNumber + ', ' + info.messageText);
        self.activeRequest.info.infos.push(info);
      });
    });

    decoder.on('unknown', function unknownEvent(tokenType) {
      debug(function (log) {
        log('  unknown token type : ' + tokenType);
        endRequest('unknown token type received : ' + tokenType);
      });
    });

    decoder.on('done', function doneEvent(done) {
      debug(function (log) {
        log('  done : ' + done.statusText + '(' + done.status + '), rowCount=' + done.rowCount);
      });

      if (done.status === DONE_STATUS.ERROR || done.status === DONE_STATUS.SRVERROR) {
        endRequest('Error executing request');
      } else if (!self.activeRequest.loginAck) {
        endRequest('loginAck token not received, but done status is not an error');
      } else {
        endRequest();
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

  function isRequestActive() {
    return !!self.activeRequest;
  }

  function startRequest(requestName, callback) {
    self.activeRequest = {
      requestName: requestName,
      info: {
        infos: [],
        errors: [],
        envChanges: []
      },
      callback: callback
    };
  }
  
  function endRequest(error) {
    if (!self.closed) {
      self.close();
      self.activeRequest.callback(error, self.activeRequest.info);
    }
    
    delete self.activeRequest;
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
        if (!self.closed) {
          self.emit('debug', text);
        }
      });
    }
  }
}

util.inherits(Connection, events.EventEmitter);

Connection.prototype.close = function() {
  this.closed = true;
  this.connection.destroy();
}

module.exports = Connection;