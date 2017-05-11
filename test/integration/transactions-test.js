var Connection = require('../../src/connection');
var Request = require('../../src/request');
var Transaction = require('../../src/transaction');

var fs = require('fs');
var async = require('async');

var debug = false;

var config = JSON.parse(
  fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')
).config;

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

config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

class Tester {
  constructor(test) {
    this.createTable = this.createTable.bind(this);
    this.createProc = this.createProc.bind(this);
    this.execProc = this.execProc.bind(this);
    this.insert = this.insert.bind(this);
    this.select = this.select.bind(this);
    this.selectExpectZeroRows = this.selectExpectZeroRows.bind(this);
    this.selectExpectOneRow = this.selectExpectOneRow.bind(this);
    this.beginTransaction = this.beginTransaction.bind(this);
    this.beginTransaction1 = this.beginTransaction1.bind(this);
    this.beginTransaction2 = this.beginTransaction2.bind(this);
    this.commitTransaction = this.commitTransaction.bind(this);
    this.rollbackTransaction = this.rollbackTransaction.bind(this);
    this.close = this.close.bind(this);
    this.run = this.run.bind(this);
    this.test = test;
    this.connection = new Connection(config);

    this.connection.on('end', (info) => {
      return this.test.done();
    });

    this.connection.on('errorMessage', (error) => {
      return console.log(`${error.number} : ${error.message}`);
    });

    this.connection.on('debug', (message) => {
      if (debug) {
        return console.log(message);
      }
    });
  }

  createTable(callback) {
    var request = new Request(
      'create table #temp (id int)',
      function(err) {
        this.test.ifError(err);
        return callback(err);
      }.bind(this)
    );

    return this.connection.execSqlBatch(request);
  }

  createProc(callback) {
    var request = new Request(
      `\
CREATE PROCEDURE #proc
AS
  SET NOCOUNT ON;

  begin transaction
  insert into #temp (id) values(1)
  commit transaction
GO`,
      function(err) {
        this.test.ifError(err);
        return callback(err);
      }.bind(this)
    );

    return this.connection.execSqlBatch(request);
  }

  execProc(callback) {
    var request = new Request(
      'exec #proc',
      function(err) {
        this.test.ifError(err);
        return callback(err);
      }.bind(this)
    );

    return this.connection.execSqlBatch(request);
  }

  insert(callback) {
    var request = new Request(
      'insert into #temp (id) values(1)',
      function(err) {
        this.test.ifError(err);
        return callback(err);
      }.bind(this)
    );

    return this.connection.execSqlBatch(request);
  }

  select(callback, expectedRows) {
    var request = new Request(
      'select id from #temp',
      function(err, rowCount) {
        this.test.ifError(err);
        this.test.strictEqual(rowCount, expectedRows);
        return callback(err);
      }.bind(this)
    );

    request.on('row', (columns) => {
      return this.test.strictEqual(columns[0].value, 1);
    });

    return this.connection.execSqlBatch(request);
  }

  selectExpectZeroRows(callback) {
    return this.select(callback, 0);
  }

  selectExpectOneRow(callback) {
    return this.select(callback, 1);
  }

  beginTransaction(callback, transactionName) {
    return this.connection.beginTransaction((err, transactionDescriptor) => {
      this.test.ifError(err);
      this.test.ok(
        config.options.tdsVersion < '7_2' ? true : transactionDescriptor
      );

      return callback(err);
    }, transactionName);
  }

  beginTransaction1(callback) {
    return this.beginTransaction(callback, 'one');
  }

  beginTransaction2(callback) {
    return this.beginTransaction(callback, 'two');
  }

  commitTransaction(callback) {
    return this.connection.commitTransaction((err) => {
      this.test.ifError(err);

      return callback(err);
    });
  }

  rollbackTransaction(callback) {
    return this.connection.rollbackTransaction((err) => {
      this.test.ifError(err);

      return callback(err);
    });
  }

  close(callback) {
    return this.connection.close();
  }

  run(actions) {
    return this.connection.on('connect', (err) => {
      return async.series(actions);
    });
  }
}

exports.transactionCommit = function(test) {
  test.expect(8);

  var tester = new Tester(test);
  return tester.run([
    tester.createTable,
    tester.beginTransaction1,
    tester.insert,
    tester.commitTransaction,
    tester.selectExpectOneRow,
    tester.close
  ]);
};

exports.transactionRollback = function(test) {
  test.expect(7);

  var tester = new Tester(test);
  return tester.run([
    tester.createTable,
    tester.beginTransaction1,
    tester.insert,
    tester.rollbackTransaction,
    tester.selectExpectZeroRows,
    tester.close
  ]);
};

exports.nestedTransactionCommit = function(test) {
  test.expect(11);

  var tester = new Tester(test);
  return tester.run([
    tester.createTable,
    tester.beginTransaction1,
    tester.beginTransaction2,
    tester.insert,
    tester.commitTransaction,
    tester.commitTransaction,
    tester.selectExpectOneRow,
    tester.close
  ]);
};

exports.nestedTransactionRollbackOuter = function(test) {
  test.expect(10);

  var tester = new Tester(test);
  return tester.run([
    tester.createTable,
    tester.beginTransaction1,
    tester.beginTransaction2,
    tester.insert,
    tester.commitTransaction,
    tester.rollbackTransaction,
    tester.selectExpectZeroRows,
    tester.close
  ]);
};

exports.nestedTransactionInProcCommit = function(test) {
  test.expect(9);

  var tester = new Tester(test);
  return tester.run([
    tester.createTable,
    tester.createProc,
    tester.beginTransaction1,
    tester.execProc,
    tester.commitTransaction,
    tester.selectExpectOneRow,
    tester.close
  ]);
};

exports.nestedTransactionInProcRollbackOuter = function(test) {
  test.expect(8);

  var tester = new Tester(test);
  return tester.run([
    tester.createTable,
    tester.createProc,
    tester.beginTransaction1,
    tester.execProc,
    tester.rollbackTransaction,
    tester.selectExpectZeroRows,
    tester.close
  ]);
};

exports.firesRollbackTransactionEventWithXactAbort = function(test) {
  // From 2.2.7.8, ENVCHANGE_TOKEN type Begin Transaction (8) is only supported
  // in TDS version 7.2 and above. 'rollbackTransaction' event fires in response
  // to that token type and hence won't be firing for lower versions.
  if (config.options.tdsVersion < '7_2') {
    test.expect(4);
  } else {
    test.expect(5);
  }

  var connection = new Connection(config);
  connection.on('end', (info) => test.done());
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message))

  return connection.on('connect', function(err) {
    var req = new Request('create table #temp (value varchar(50))', function(
      err
    ) {
      test.ifError(err);

      req = new Request('SET XACT_ABORT ON', function(err) {
        test.ifError(err);

        return connection.beginTransaction(function(err) {
          test.ifError(err);

          connection.on('rollbackTransaction', function() {
            // Ensure rollbackTransaction event is fired
            return test.ok(true);
          });

          req = new Request(
            "insert into #temp values ('asdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasd')",
            function(err) {
              test.strictEqual(
                err.message,
                'String or binary data would be truncated.'
              );

              return connection.close();
            }
          );
          return connection.execSqlBatch(req);
        });
      });
      return connection.execSqlBatch(req);
    });
    return connection.execSqlBatch(req);
  });
};

exports.transactionHelper = function(test) {
  test.expect(3);

  var connection = new Connection(config);
  connection.on('end', (info) => test.done());
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message) if (debug))

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
  test.expect(9);

  var connection = new Connection(config);
  connection.on('end', (info) => test.done());
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message) if (debug))

  return connection.on('connect', function(err) {
    var request = new Request('create table #temp (id int)', function(err) {
      test.ifError(err);

      return connection.transaction(function(err, outerDone) {
        test.ifError(err);

        request = new Request('insert into #temp (id) VALUES (1)', function(
          err
        ) {
          test.ifError(err);

          return connection.transaction(function(err, innerDone) {
            test.ifError(err);

            request = new Request('insert into #temp (id) VALUES (2)', function(
              err
            ) {
              test.ifError(err);

              var expectedError = new Error('Something failed');
              return innerDone(expectedError, function(err) {
                test.strictEqual(err, expectedError);

                // Do not pass the error to the outer transaction continuation
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
  test.expect(7);

  var connection = new Connection(config);
  connection.on('end', (info) => test.done());
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message) if (debug))

  return connection.on('connect', function(err) {
    var request = new Request('create table #temp (id int)', function(err) {
      test.ifError(err);

      return connection.transaction(function(err, outerDone) {
        test.ifError(err);

        request = new Request('insert into #temp (id) VALUES (1)', function(
          err
        ) {
          test.ifError(err);

          return connection.transaction(function(err, innerDone) {
            test.ifError(err);

            request = new Request('insert into #temp (id) VALUES (2)', function(
              err
            ) {
              test.ifError(err);

              var expectedError = new Error('Something failed');
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
  test.expect(4);

  var connection = new Connection(config);
  connection.on('end', (info) => test.done());
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message) if (debug))

  return connection.on('connect', function(err) {
    return connection.transaction(function(err, outerDone) {
      test.ifError(err);

      return connection.transaction(function(err, innerDone) {
        test.ifError(err);

        var request = new Request('create table #temp (id int)', function(err) {
          test.ifError(err);

          request = new Request('create table #temp (id int)', function(err) {
            return innerDone(err, outerDone, function(err) {
              test.equal(
                err.message,
                "There is already an object named '#temp' in the database."
              );

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
  test.expect(3);

  var connection = new Connection(config);
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('error', function(err) {
    return test.ok(~err.message.indexOf('socket error'));
  });
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message) if (debug))

  return connection.on('connect', function(err) {
    return connection.transaction(function(err, outerDone) {
      test.ifError(err);

      return connection.transaction(function(err, innerDone) {
        test.ifError(err);

        var request = new Request('WAITFOR 00:00:30', function(err) {
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
  test.expect(8);

  var connection = new Connection(config);
  connection.on('end', (info) => test.done());
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message) if (debug))

  return connection.on('connect', function(err) {
    return connection.transaction(function(err, outerDone) {
      test.ifError(err);

      var request = new Request(
        'SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID',
        function(err) {
          test.ifError(err);

          return connection.transaction(function(err, innerDone) {
            test.ifError(err);

            request = new Request(
              'SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID',
              function(err) {
                test.ifError(err);

                return innerDone(null, outerDone, function(err) {
                  request = new Request(
                    'SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID',
                    function(err) {
                      test.ifError(err);

                      return connection.close();
                    }
                  );

                  request.on('row', function(row) {
                    return test.equal(
                      row[0].value,
                      Transaction.ISOLATION_LEVEL.SERIALIZABLE
                    );
                  });

                  return connection.execSqlBatch(request);
                });
              }
            );

            request.on('row', function(row) {
              return test.equal(
                row[0].value,
                Transaction.ISOLATION_LEVEL.SERIALIZABLE
              );
            });

            return connection.execSqlBatch(request);
          }, Transaction.ISOLATION_LEVEL.SERIALIZABLE);
        }
      );

      request.on('row', function(row) {
        return test.equal(
          row[0].value,
          Transaction.ISOLATION_LEVEL.REPEATABLE_READ
        );
      });

      return connection.execSqlBatch(request);
    }, Transaction.ISOLATION_LEVEL.REPEATABLE_READ);
  });
};

exports.transactionHelperResetOpenTransactionCount = function(test) {
  test.expect(3);

  var connection = new Connection(config);
  connection.on('end', (info) => test.done());
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message) if (debug))

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
  test.expect(11);

  var connection = new Connection(config);
  connection.on('end', (info) => test.done());
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message) if (debug))

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
