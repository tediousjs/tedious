'use strict';

var Connection, Request, Tester, Transaction, async, config, debug, fs,
  bind = function(fn, me) { return function() { return fn.apply(me, arguments); }; };

Connection = require('../../src/connection');

Request = require('../../src/request');

Transaction = require('../../src/transaction');

fs = require('fs');

async = require('async');

debug = false;

config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config;

if (debug) {
  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: true,
    log: true
  };
} else {
  config.options.debug = {};
}

Tester = (function() {
  function Tester(test1) {
    this.test = test1;
    this.run = bind(this.run, this);
    this.close = bind(this.close, this);
    this.rollbackTransaction = bind(this.rollbackTransaction, this);
    this.commitTransaction = bind(this.commitTransaction, this);
    this.beginTransaction2 = bind(this.beginTransaction2, this);
    this.beginTransaction1 = bind(this.beginTransaction1, this);
    this.beginTransaction = bind(this.beginTransaction, this);
    this.selectExpectOneRow = bind(this.selectExpectOneRow, this);
    this.selectExpectZeroRows = bind(this.selectExpectZeroRows, this);
    this.select = bind(this.select, this);
    this.insert = bind(this.insert, this);
    this.execProc = bind(this.execProc, this);
    this.createProc = bind(this.createProc, this);
    this.createTable = bind(this.createTable, this);
    this.connection = new Connection(config);
    this.connection.on('end', (function(_this) {
      return function(info) {
        return _this.test.done();
      };
    })(this));
    this.connection.on('errorMessage', (function(_this) {
      return function(error) {
        return console.log(error.number + ' : ' + error.message);
      };
    })(this));
    this.connection.on('debug', (function(_this) {
      return function(message) {
        if (debug) {
          return console.log(message);
        }
      };
    })(this));
  }

  Tester.prototype.createTable = function(callback) {
    var request;
    request = new Request('create table #temp (id int)', (function(_this) {
      return function(err) {
        _this.test.ifError(err);
        return callback(err);
      };
    })(this));
    return this.connection.execSqlBatch(request);
  };

  Tester.prototype.createProc = function(callback) {
    var request;
    request = new Request('CREATE PROCEDURE #proc\nAS\n  SET NOCOUNT ON;\n\n  begin transaction\n  insert into #temp (id) values(1)\n  commit transaction\nGO', (function(_this) {
      return function(err) {
        _this.test.ifError(err);
        return callback(err);
      };
    })(this));
    return this.connection.execSqlBatch(request);
  };

  Tester.prototype.execProc = function(callback) {
    var request;
    request = new Request('exec #proc', (function(_this) {
      return function(err) {
        _this.test.ifError(err);
        return callback(err);
      };
    })(this));
    return this.connection.execSqlBatch(request);
  };

  Tester.prototype.insert = function(callback) {
    var request;
    request = new Request('insert into #temp (id) values(1)', (function(_this) {
      return function(err) {
        _this.test.ifError(err);
        return callback(err);
      };
    })(this));
    return this.connection.execSqlBatch(request);
  };

  Tester.prototype.select = function(callback, expectedRows) {
    var request;
    request = new Request('select id from #temp', (function(_this) {
      return function(err, rowCount) {
        _this.test.ifError(err);
        _this.test.strictEqual(rowCount, expectedRows);
        return callback(err);
      };
    })(this));
    request.on('row', (function(_this) {
      return function(columns) {
        return _this.test.strictEqual(columns[0].value, 1);
      };
    })(this));
    return this.connection.execSqlBatch(request);
  };

  Tester.prototype.selectExpectZeroRows = function(callback) {
    return this.select(callback, 0);
  };

  Tester.prototype.selectExpectOneRow = function(callback) {
    return this.select(callback, 1);
  };

  Tester.prototype.beginTransaction = function(callback, transactionName) {
    return this.connection.beginTransaction((function(_this) {
      return function(err, transactionDescriptor) {
        _this.test.ifError(err);
        _this.test.ok(config.options.tdsVersion < '7_2' ? true : transactionDescriptor);
        return callback(err);
      };
    })(this), transactionName);
  };

  Tester.prototype.beginTransaction1 = function(callback) {
    return this.beginTransaction(callback, 'one');
  };

  Tester.prototype.beginTransaction2 = function(callback) {
    return this.beginTransaction(callback, 'two');
  };

  Tester.prototype.commitTransaction = function(callback) {
    return this.connection.commitTransaction((function(_this) {
      return function(err) {
        _this.test.ifError(err);
        return callback(err);
      };
    })(this));
  };

  Tester.prototype.rollbackTransaction = function(callback) {
    return this.connection.rollbackTransaction((function(_this) {
      return function(err) {
        _this.test.ifError(err);
        return callback(err);
      };
    })(this));
  };

  Tester.prototype.close = function(callback) {
    return this.connection.close();
  };

  Tester.prototype.run = function(actions) {
    return this.connection.on('connect', (function(_this) {
      return function(err) {
        return async.series(actions);
      };
    })(this));
  };

  return Tester;

})();

exports.transactionCommit = function(test) {
  var tester;
  test.expect(8);
  tester = new Tester(test);
  return tester.run([tester.createTable, tester.beginTransaction1, tester.insert, tester.commitTransaction, tester.selectExpectOneRow, tester.close]);
};

exports.transactionRollback = function(test) {
  var tester;
  test.expect(7);
  tester = new Tester(test);
  return tester.run([tester.createTable, tester.beginTransaction1, tester.insert, tester.rollbackTransaction, tester.selectExpectZeroRows, tester.close]);
};

exports.nestedTransactionCommit = function(test) {
  var tester;
  test.expect(11);
  tester = new Tester(test);
  return tester.run([tester.createTable, tester.beginTransaction1, tester.beginTransaction2, tester.insert, tester.commitTransaction, tester.commitTransaction, tester.selectExpectOneRow, tester.close]);
};

exports.nestedTransactionRollbackOuter = function(test) {
  var tester;
  test.expect(10);
  tester = new Tester(test);
  return tester.run([tester.createTable, tester.beginTransaction1, tester.beginTransaction2, tester.insert, tester.commitTransaction, tester.rollbackTransaction, tester.selectExpectZeroRows, tester.close]);
};

exports.nestedTransactionInProcCommit = function(test) {
  var tester;
  test.expect(9);
  tester = new Tester(test);
  return tester.run([tester.createTable, tester.createProc, tester.beginTransaction1, tester.execProc, tester.commitTransaction, tester.selectExpectOneRow, tester.close]);
};

exports.nestedTransactionInProcRollbackOuter = function(test) {
  var tester;
  test.expect(8);
  tester = new Tester(test);
  return tester.run([tester.createTable, tester.createProc, tester.beginTransaction1, tester.execProc, tester.rollbackTransaction, tester.selectExpectZeroRows, tester.close]);
};

exports.firesRollbackTransactionEventWithXactAbort = function(test) {
  var connection;
  test.expect(5);
  connection = new Connection(config);
  connection.on('end', (function(_this) {
    return function(info) {
      return test.done();
    };
  })(this));
  return connection.on('connect', function(err) {
    var req;
    req = new Request('create table #temp (value varchar(50))', function(err) {
      test.ifError(err);
      req = new Request('SET XACT_ABORT ON', function(err) {
        test.ifError(err);
        return connection.beginTransaction(function(err) {
          test.ifError(err);
          connection.on('rollbackTransaction', function() {
            return test.ok(true);
          });
          req = new Request("insert into #temp values ('asdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasd')", function(err) {
            test.strictEqual(err.message, 'String or binary data would be truncated.');
            return connection.close();
          });
          return connection.execSqlBatch(req);
        });
      });
      return connection.execSqlBatch(req);
    });
    return connection.execSqlBatch(req);
  });
};

exports.transactionHelper = function(test) {
  var connection;
  test.expect(3);
  connection = new Connection(config);
  connection.on('end', (function(_this) {
    return function(info) {
      return test.done();
    };
  })(this));
  return connection.on('connect', function(err) {
    return connection.transaction(function(err, outerDone) {
      test.ifError(err);
      return connection.transaction(function(err, innerDone) {
        test.ifError(err);
        return innerDone(null, outerDone, function(err) {
          test.ifError(err);
          return connection.close();
        });
      });
    });
  });
};

exports.transactionHelperSelectiveRollback = function(test) {
  var connection;
  test.expect(9);
  connection = new Connection(config);
  connection.on('end', (function(_this) {
    return function(info) {
      return test.done();
    };
  })(this));
  return connection.on('connect', function(err) {
    var request;
    request = new Request('create table #temp (id int)', function(err) {
      test.ifError(err);
      return connection.transaction(function(err, outerDone) {
        test.ifError(err);
        request = new Request('insert into #temp (id) VALUES (1)', function(err) {
          test.ifError(err);
          return connection.transaction(function(err, innerDone) {
            test.ifError(err);
            request = new Request('insert into #temp (id) VALUES (2)', function(err) {
              var expectedError;
              test.ifError(err);
              expectedError = new Error('Something failed');
              return innerDone(expectedError, function(err) {
                test.strictEqual(err, expectedError);
                return outerDone(null, function(err) {
                  test.ifError(err);
                  request = new Request('select * from #temp', function(err) {
                    test.ifError(err);
                    return connection.close();
                  });
                  request.on('row', function(row) {
                    return test.strictEqual(row[0].value, 1);
                  });
                  return connection.execSql(request);
                });
              });
            });
            return connection.execSql(request);
          });
        });
        return connection.execSql(request);
      });
    });
    return connection.execSqlBatch(request);
  });
};

exports.transactionHelperFullRollback = function(test) {
  var connection;
  test.expect(7);
  connection = new Connection(config);
  connection.on('end', (function(_this) {
    return function(info) {
      return test.done();
    };
  })(this));
  return connection.on('connect', function(err) {
    var request;
    request = new Request('create table #temp (id int)', function(err) {
      test.ifError(err);
      return connection.transaction(function(err, outerDone) {
        test.ifError(err);
        request = new Request('insert into #temp (id) VALUES (1)', function(err) {
          test.ifError(err);
          return connection.transaction(function(err, innerDone) {
            test.ifError(err);
            request = new Request('insert into #temp (id) VALUES (2)', function(err) {
              var expectedError;
              test.ifError(err);
              expectedError = new Error('Something failed');
              return innerDone(expectedError, outerDone, function(err) {
                test.strictEqual(err, expectedError);
                request = new Request('select * from #temp', function(err) {
                  test.ifError(err);
                  return connection.close();
                });
                request.on('row', function(row) {
                  throw new Error('Did not expect any rows');
                });
                return connection.execSql(request);
              });
            });
            return connection.execSql(request);
          });
        });
        return connection.execSql(request);
      });
    });
    return connection.execSqlBatch(request);
  });
};

exports.transactionHelperBatchAbortingError = function(test) {
  var connection;
  test.expect(4);
  connection = new Connection(config);
  connection.on('end', (function(_this) {
    return function(info) {
      return test.done();
    };
  })(this));
  return connection.on('connect', function(err) {
    return connection.transaction(function(err, outerDone) {
      test.ifError(err);
      return connection.transaction(function(err, innerDone) {
        var request;
        test.ifError(err);
        request = new Request('create table #temp (id int)', function(err) {
          test.ifError(err);
          request = new Request('create table #temp (id int)', function(err) {
            return innerDone(err, outerDone, function(err) {
              test.equal(err.message, "There is already an object named '#temp' in the database.");
              return connection.close();
            });
          });
          return connection.execSqlBatch(request);
        });
        return connection.execSqlBatch(request);
      });
    });
  });
};

exports.transactionHelperSocketError = function(test) {
  var connection;
  test.expect(3);
  connection = new Connection(config);
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('error', function(err) {
    return test.ok(~err.message.indexOf('socket error'));
  });
  return connection.on('connect', function(err) {
    return connection.transaction(function(err, outerDone) {
      test.ifError(err);
      return connection.transaction(function(err, innerDone) {
        var request;
        test.ifError(err);
        request = new Request('WAITFOR 00:00:30', function(err) {
          return innerDone(err, outerDone, function(err) {
            return test.ok(~err.message.indexOf('socket error'));
          });
        });
        connection.execSql(request);
        return connection.socket.emit('error', new Error('socket error'));
      });
    });
  });
};

exports.transactionHelperIsolationLevel = function(test) {
  var connection;
  test.expect(8);
  connection = new Connection(config);
  connection.on('end', (function(_this) {
    return function(info) {
      return test.done();
    };
  })(this));
  return connection.on('connect', function(err) {
    return connection.transaction(function(err, outerDone) {
      var request;
      test.ifError(err);
      request = new Request('SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID', function(err) {
        test.ifError(err);
        return connection.transaction(function(err, innerDone) {
          test.ifError(err);
          request = new Request('SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID', function(err) {
            test.ifError(err);
            return innerDone(null, outerDone, function(err) {
              request = new Request('SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID', function(err) {
                test.ifError(err);
                return connection.close();
              });
              request.on('row', function(row) {
                return test.equal(row[0].value, Transaction.ISOLATION_LEVEL.SERIALIZABLE);
              });
              return connection.execSqlBatch(request);
            });
          });
          request.on('row', function(row) {
            return test.equal(row[0].value, Transaction.ISOLATION_LEVEL.SERIALIZABLE);
          });
          return connection.execSqlBatch(request);
        }, Transaction.ISOLATION_LEVEL.SERIALIZABLE);
      });
      request.on('row', function(row) {
        return test.equal(row[0].value, Transaction.ISOLATION_LEVEL.REPEATABLE_READ);
      });
      return connection.execSqlBatch(request);
    }, Transaction.ISOLATION_LEVEL.REPEATABLE_READ);
  });
};

exports.transactionHelperResetOpenTransactionCount = function(test) {
  var connection;
  test.expect(3);
  connection = new Connection(config);
  connection.on('end', (function(_this) {
    return function(info) {
      return test.done();
    };
  })(this));
  return connection.on('connect', function(err) {
    return connection.transaction(function(err) {
      test.ifError(err);
      return connection.reset(function(err) {
        test.ifError(err);
        test.strictEqual(connection.inTransaction, false);
        return connection.close();
      });
    });
  });
};

exports.transactionHelperMixedWithLowLevelTransactionMethods = function(test) {
  var connection;
  test.expect(11);
  connection = new Connection(config);
  connection.on('end', (function(_this) {
    return function(info) {
      return test.done();
    };
  })(this));
  return connection.on('connect', function(err) {
    return connection.beginTransaction(function(err) {
      test.ifError(err);
      test.strictEqual(connection.inTransaction, true);
      return connection.transaction(function(err, txDone) {
        test.ifError(err);
        test.strictEqual(connection.inTransaction, true);
        return connection.beginTransaction(function(err) {
          test.ifError(err);
          test.strictEqual(connection.inTransaction, true);
          return connection.commitTransaction(function(err) {
            test.ifError(err);
            test.strictEqual(connection.inTransaction, true);
            return txDone(null, function(err) {
              test.strictEqual(connection.inTransaction, true);
              return connection.commitTransaction(function(err) {
                test.ifError(err);
                test.strictEqual(connection.inTransaction, false);
                return connection.close();
              });
            });
          });
        });
      });
    });
  });
};
