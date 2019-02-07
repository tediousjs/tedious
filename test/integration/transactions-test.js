var Connection = require('../../src/connection');
var Request = require('../../src/request');
var Transaction = require('../../src/transaction');

var fs = require('fs');
var async = require('async');

var debug = false;

var config = JSON.parse(
  fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
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
      this.test.done();
    });

    this.connection.on('errorMessage', (error) => {
      console.log(`${error.number} : ${error.message}`);
    });

    this.connection.on('debug', (message) => {
      if (debug) {
        console.log(message);
      }
    });
  }

  createTable(callback) {
    var request = new Request(
      'create table #temp (id int)',
      function(err) {
        this.test.ifError(err);
        callback(err);
      }.bind(this)
    );

    this.connection.execSqlBatch(request);
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
        callback(err);
      }.bind(this)
    );

    this.connection.execSqlBatch(request);
  }

  execProc(callback) {
    var request = new Request(
      'exec #proc',
      function(err) {
        this.test.ifError(err);
        callback(err);
      }.bind(this)
    );

    this.connection.execSqlBatch(request);
  }

  insert(callback) {
    var request = new Request(
      'insert into #temp (id) values(1)',
      function(err) {
        this.test.ifError(err);
        callback(err);
      }.bind(this)
    );

    this.connection.execSqlBatch(request);
  }

  select(callback, expectedRows) {
    var request = new Request(
      'select id from #temp',
      function(err, rowCount) {
        this.test.ifError(err);
        this.test.strictEqual(rowCount, expectedRows);
        callback(err);
      }.bind(this)
    );

    request.on('row', (columns) => {
      this.test.strictEqual(columns[0].value, 1);
    });

    this.connection.execSqlBatch(request);
  }

  selectExpectZeroRows(callback) {
    this.select(callback, 0);
  }

  selectExpectOneRow(callback) {
    this.select(callback, 1);
  }

  beginTransaction(callback, transactionName) {
    this.connection.beginTransaction((err, transactionDescriptor) => {
      this.test.ifError(err);
      this.test.ok(
        config.options.tdsVersion < '7_2' ? true : transactionDescriptor
      );

      callback(err);
    }, transactionName);
  }

  beginTransaction1(callback) {
    this.beginTransaction(callback, 'one');
  }

  beginTransaction2(callback) {
    this.beginTransaction(callback, 'two');
  }

  commitTransaction(callback) {
    this.connection.commitTransaction((err) => {
      this.test.ifError(err);

      callback(err);
    });
  }

  rollbackTransaction(callback) {
    this.connection.rollbackTransaction((err) => {
      this.test.ifError(err);

      callback(err);
    });
  }

  close(callback) {
    this.connection.close();
  }

  run(actions) {
    this.connection.on('connect', (err) => {
      async.series(actions);
    });
  }
}

exports.transactionCommit = function(test) {
  test.expect(8);

  var tester = new Tester(test);
  tester.run([
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
  tester.run([
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
  tester.run([
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
  tester.run([
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
  tester.run([
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
  tester.run([
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

  connection.on('connect', function(err) {
    var req = new Request('create table #temp (value varchar(50))', function(
      err
    ) {
      test.ifError(err);

      req = new Request('SET XACT_ABORT ON', function(err) {
        test.ifError(err);

        connection.beginTransaction(function(err) {
          test.ifError(err);

          connection.on('rollbackTransaction', function() {
            // Ensure rollbackTransaction event is fired
            test.ok(true);
          });

          req = new Request(
            "insert into #temp values ('asdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasd')",
            function(err) {
              test.strictEqual(
                err.message,
                'String or binary data would be truncated.'
              );

              connection.close();
            }
          );
          connection.execSqlBatch(req);
        });
      });
      connection.execSqlBatch(req);
    });
    connection.execSqlBatch(req);
  });
};

exports.transactionHelper = function(test) {
  test.expect(3);

  var connection = new Connection(config);
  connection.on('end', (info) => test.done());
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message) if (debug))

  connection.on('connect', function(err) {
    connection.transaction(function(err, outerDone) {
      test.ifError(err);

      connection.transaction(function(err, innerDone) {
        test.ifError(err);

        innerDone(null, outerDone, function(err) {
          test.ifError(err);
          connection.close();
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

  connection.on('connect', function(err) {
    var request = new Request('create table #temp (id int)', function(err) {
      test.ifError(err);

      connection.transaction(function(err, outerDone) {
        test.ifError(err);

        request = new Request('insert into #temp (id) VALUES (1)', function(
          err
        ) {
          test.ifError(err);

          connection.transaction(function(err, innerDone) {
            test.ifError(err);

            request = new Request('insert into #temp (id) VALUES (2)', function(
              err
            ) {
              test.ifError(err);

              var expectedError = new Error('Something failed');
              innerDone(expectedError, function(err) {
                test.strictEqual(err, expectedError);

                // Do not pass the error to the outer transaction continuation
                outerDone(null, function(err) {
                  test.ifError(err);

                  request = new Request('select * from #temp', function(err) {
                    test.ifError(err);
                    connection.close();
                  });

                  request.on('row', function(row) {
                    test.strictEqual(row[0].value, 1);
                  });

                  connection.execSql(request);
                });
              });
            });

            connection.execSql(request);
          });
        });
        connection.execSql(request);
      });
    });
    connection.execSqlBatch(request);
  });
};

exports.transactionHelperFullRollback = function(test) {
  test.expect(7);

  var connection = new Connection(config);
  connection.on('end', (info) => test.done());
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message) if (debug))

  connection.on('connect', function(err) {
    var request = new Request('create table #temp (id int)', function(err) {
      test.ifError(err);

      connection.transaction(function(err, outerDone) {
        test.ifError(err);

        request = new Request('insert into #temp (id) VALUES (1)', function(
          err
        ) {
          test.ifError(err);

          connection.transaction(function(err, innerDone) {
            test.ifError(err);

            request = new Request('insert into #temp (id) VALUES (2)', function(
              err
            ) {
              test.ifError(err);

              var expectedError = new Error('Something failed');
              innerDone(expectedError, outerDone, function(err) {
                test.strictEqual(err, expectedError);

                request = new Request('select * from #temp', function(err) {
                  test.ifError(err);
                  connection.close();
                });

                request.on('row', function(row) {
                  throw new Error('Did not expect any rows');
                });

                connection.execSql(request);
              });
            });

            connection.execSql(request);
          });
        });
        connection.execSql(request);
      });
    });
    connection.execSqlBatch(request);
  });
};

exports.transactionHelperBatchAbortingError = function(test) {
  test.expect(4);

  var connection = new Connection(config);
  connection.on('end', (info) => test.done());
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message) if (debug))

  connection.on('connect', function(err) {
    connection.transaction(function(err, outerDone) {
      test.ifError(err);

      connection.transaction(function(err, innerDone) {
        test.ifError(err);

        var request = new Request('create table #temp (id int)', function(err) {
          test.ifError(err);

          request = new Request('create table #temp (id int)', function(err) {
            innerDone(err, outerDone, function(err) {
              test.equal(
                err.message,
                "There is already an object named '#temp' in the database."
              );

              connection.close();
            });
          });

          connection.execSqlBatch(request);
        });
        connection.execSqlBatch(request);
      });
    });
  });
};

exports.transactionHelperSocketError = function(test) {
  test.expect(5);

  var connection = new Connection(config);
  connection.on('end', function(info) {
    test.done();
  });
  connection.on('error', function(err) {
    test.ok(~err.message.indexOf('socket error'));
  });
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message) if (debug))

  connection.on('connect', function(err) {
    connection.transaction(function(err, outerDone) {
      test.ifError(err);

      connection.transaction(function(err, innerDone) {
        test.ifError(err);

        var request = new Request('WAITFOR 00:00:30', function(err) {
          test.ok(~err.message.indexOf('socket error'));

          innerDone(err, outerDone, function(err) {
            test.ok(~err.message.indexOf('socket error'));
          });
        });

        connection.execSql(request);
        connection.socket.emit('error', new Error('socket error'));
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

  connection.on('connect', function(err) {
    connection.transaction(function(err, outerDone) {
      test.ifError(err);

      var request = new Request(
        'SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID',
        function(err) {
          test.ifError(err);

          connection.transaction(function(err, innerDone) {
            test.ifError(err);

            request = new Request(
              'SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID',
              function(err) {
                test.ifError(err);

                innerDone(null, outerDone, function(err) {
                  request = new Request(
                    'SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID',
                    function(err) {
                      test.ifError(err);

                      connection.close();
                    }
                  );

                  request.on('row', function(row) {
                    test.equal(
                      row[0].value,
                      Transaction.ISOLATION_LEVEL.SERIALIZABLE
                    );
                  });

                  connection.execSqlBatch(request);
                });
              }
            );

            request.on('row', function(row) {
              test.equal(
                row[0].value,
                Transaction.ISOLATION_LEVEL.SERIALIZABLE
              );
            });

            connection.execSqlBatch(request);
          }, Transaction.ISOLATION_LEVEL.SERIALIZABLE);
        }
      );

      request.on('row', function(row) {
        test.equal(
          row[0].value,
          Transaction.ISOLATION_LEVEL.REPEATABLE_READ
        );
      });

      connection.execSqlBatch(request);
    }, Transaction.ISOLATION_LEVEL.REPEATABLE_READ);
  });
};

exports.transactionHelperResetOpenTransactionCount = function(test) {
  test.expect(3);

  var connection = new Connection(config);
  connection.on('end', (info) => test.done());
  //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
  //  connection.on('debug', (message) => console.log(message) if (debug))

  connection.on('connect', function(err) {
    connection.transaction(function(err) {
      test.ifError(err);

      connection.reset(function(err) {
        test.ifError(err);

        test.strictEqual(connection.inTransaction, false);
        connection.close();
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

  connection.on('connect', function(err) {
    connection.beginTransaction(function(err) {
      test.ifError(err);

      test.strictEqual(connection.inTransaction, true);

      connection.transaction(function(err, txDone) {
        test.ifError(err);

        test.strictEqual(connection.inTransaction, true);

        connection.beginTransaction(function(err) {
          test.ifError(err);

          test.strictEqual(connection.inTransaction, true);

          connection.commitTransaction(function(err) {
            test.ifError(err);

            test.strictEqual(connection.inTransaction, true);

            txDone(null, function(err) {
              test.strictEqual(connection.inTransaction, true);

              connection.commitTransaction(function(err) {
                test.ifError(err);

                test.strictEqual(connection.inTransaction, false);

                connection.close();
              });
            });
          });
        });
      });
    });
  });
};
