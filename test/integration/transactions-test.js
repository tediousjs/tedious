const Connection = require('../../src/connection');
const Request = require('../../src/request');
const Transaction = require('../../src/transaction');
const fs = require('fs');
const async = require('async');
const assert = require('chai').assert;

const debug = false;

const config = JSON.parse(
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
  constructor(done) {
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
    this.done = done;
    this.connection = new Connection(config);

    this.connection.on('end', (info) => {
      this.done();
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
    const request = new Request(
      'create table #temp (id int)',
      function(err) {
        assert.ifError(err);
        callback(err);
      }.bind(this)
    );

    this.connection.execSqlBatch(request);
  }

  createProc(callback) {
    const request = new Request(
      `\
CREATE PROCEDURE #proc
AS
  SET NOCOUNT ON;

  begin transaction
  insert into #temp (id) values(1)
  commit transaction
GO`,
      function(err) {
        assert.ifError(err);
        callback(err);
      }.bind(this)
    );

    this.connection.execSqlBatch(request);
  }

  execProc(callback) {
    const request = new Request(
      'exec #proc',
      function(err) {
        assert.ifError(err);
        callback(err);
      }.bind(this)
    );

    this.connection.execSqlBatch(request);
  }

  insert(callback) {
    const request = new Request(
      'insert into #temp (id) values(1)',
      function(err) {
        assert.ifError(err);
        callback(err);
      }.bind(this)
    );

    this.connection.execSqlBatch(request);
  }

  select(callback, expectedRows) {
    const request = new Request(
      'select id from #temp',
      function(err, rowCount) {
        assert.ifError(err);
        assert.strictEqual(rowCount, expectedRows);
        callback(err);
      }.bind(this)
    );

    request.on('row', (columns) => {
      assert.strictEqual(columns[0].value, 1);
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
      assert.ifError(err);
      assert.ok(
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
      assert.ifError(err);

      callback(err);
    });
  }

  rollbackTransaction(callback) {
    this.connection.rollbackTransaction((err) => {
      assert.ifError(err);

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

describe('Transactions Test', function() {
  it('should test transaction commit', function(done) {
    const tester = new Tester(done);
    tester.run([
      tester.createTable,
      tester.beginTransaction1,
      tester.insert,
      tester.commitTransaction,
      tester.selectExpectOneRow,
      tester.close
    ]);
  });

  it('should test transaction rollback', function(done) {
    const tester = new Tester(done);
    tester.run([
      tester.createTable,
      tester.beginTransaction1,
      tester.insert,
      tester.rollbackTransaction,
      tester.selectExpectZeroRows,
      tester.close
    ]);
  });

  it('should test nested transaction commit', function(done) {
    const tester = new Tester(done);
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
  });

  it('should test tested transaction rollback outer', function(done) {
    const tester = new Tester(done);
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
  });

  it('should test nested transaction in proc commit', function(done) {
    const tester = new Tester(done);
    tester.run([
      tester.createTable,
      tester.createProc,
      tester.beginTransaction1,
      tester.execProc,
      tester.commitTransaction,
      tester.selectExpectOneRow,
      tester.close
    ]);
  });

  it('should test nested transaction in proc rollback outer', function(done) {
    const tester = new Tester(done);
    tester.run([
      tester.createTable,
      tester.createProc,
      tester.beginTransaction1,
      tester.execProc,
      tester.rollbackTransaction,
      tester.selectExpectZeroRows,
      tester.close
    ]);
  });

  it('should test first rollback transaction event with xact abort', function(done) {
    // From 2.2.7.8, ENVCHANGE_TOKEN type Begin Transaction (8) is only supported
    // in TDS version 7.2 and above. 'rollbackTransaction' event fires in response
    // to that token type and hence won't be firing for lower versions.
    if (config.options.tdsVersion < '7_2') {
      // test.expect(4);
    } else {
      // test.expect(5);
    }

    const connection = new Connection(config);
    connection.on('end', (info) => done());
    //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
    //  connection.on('debug', (message) => console.log(message))

    connection.on('connect', function(err) {
      let req = new Request('create table #temp (value varchar(50))', function(
        err
      ) {
        assert.ifError(err);

        req = new Request('SET XACT_ABORT ON', function(err) {
          assert.ifError(err);

          connection.beginTransaction(function(err) {
            assert.ifError(err);

            connection.on('rollbackTransaction', function() {
              // Ensure rollbackTransaction event is fired
              assert.ok(true);
            });

            req = new Request("insert into #temp values ('asdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasd')", function(err) {
              assert.match(err.message, /^String or binary data would be truncated/);

              connection.close();
            });
            connection.execSqlBatch(req);
          });
        });
        connection.execSqlBatch(req);
      });
      connection.execSqlBatch(req);
    });
  });

  it('should test transaction helper', function(done) {
    const connection = new Connection(config);
    connection.on('end', (info) => done());
    //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
    //  connection.on('debug', (message) => console.log(message) if (debug))

    connection.on('connect', function(err) {
      connection.transaction(function(err, outerDone) {
        assert.ifError(err);

        connection.transaction(function(err, innerDone) {
          assert.ifError(err);

          innerDone(null, outerDone, function(err) {
            assert.ifError(err);
            connection.close();
          });
        });
      });
    });
  });

  it('should test transaction helper selective rollback', function(done) {
    const connection = new Connection(config);
    connection.on('end', (info) => done());
    //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
    //  connection.on('debug', (message) => console.log(message) if (debug))

    connection.on('connect', function(err) {
      let request = new Request('create table #temp (id int)', function(err) {
        assert.ifError(err);

        connection.transaction(function(err, outerDone) {
          assert.ifError(err);

          request = new Request('insert into #temp (id) VALUES (1)', function(
            err
          ) {
            assert.ifError(err);

            connection.transaction(function(err, innerDone) {
              assert.ifError(err);

              request = new Request('insert into #temp (id) VALUES (2)', function(
                err
              ) {
                assert.ifError(err);

                const expectedError = new Error('Something failed');
                innerDone(expectedError, function(err) {
                  assert.strictEqual(err, expectedError);

                  // Do not pass the error to the outer transaction continuation
                  outerDone(null, function(err) {
                    assert.ifError(err);

                    request = new Request('select * from #temp', function(err) {
                      assert.ifError(err);
                      connection.close();
                    });

                    request.on('row', function(row) {
                      assert.strictEqual(row[0].value, 1);
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
  });

  it('should test transaction helper full rollback', function(done) {
    const connection = new Connection(config);
    connection.on('end', (info) => done());
    //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
    //  connection.on('debug', (message) => console.log(message) if (debug))

    connection.on('connect', function(err) {
      let request = new Request('create table #temp (id int)', function(err) {
        assert.ifError(err);

        connection.transaction(function(err, outerDone) {
          assert.ifError(err);

          request = new Request('insert into #temp (id) VALUES (1)', function(
            err
          ) {
            assert.ifError(err);

            connection.transaction(function(err, innerDone) {
              assert.ifError(err);

              request = new Request('insert into #temp (id) VALUES (2)', function(
                err
              ) {
                assert.ifError(err);

                const expectedError = new Error('Something failed');
                innerDone(expectedError, outerDone, function(err) {
                  assert.strictEqual(err, expectedError);

                  request = new Request('select * from #temp', function(err) {
                    assert.ifError(err);
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
  });

  it('should test transaction helper batch aborting error', function(done) {
    const connection = new Connection(config);
    connection.on('end', (info) => done());
    //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
    //  connection.on('debug', (message) => console.log(message) if (debug))

    connection.on('connect', function(err) {
      connection.transaction(function(err, outerDone) {
        assert.ifError(err);

        connection.transaction(function(err, innerDone) {
          assert.ifError(err);

          let request = new Request('create table #temp (id int)', function(err) {
            assert.ifError(err);

            request = new Request('create table #temp (id int)', function(err) {
              innerDone(err, outerDone, function(err) {
                assert.equal(
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
  });

  it('should test transaction helper socket error', function(done) {
    const connection = new Connection(config);
    connection.on('end', function(info) {
      done();
    });
    connection.on('error', function(err) {
      assert.ok(~err.message.indexOf('socket error'));
    });
    //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
    //  connection.on('debug', (message) => console.log(message) if (debug))

    connection.on('connect', function(err) {
      connection.transaction(function(err, outerDone) {
        assert.ifError(err);

        connection.transaction(function(err, innerDone) {
          assert.ifError(err);

          const request = new Request('WAITFOR 00:00:30', function(err) {
            assert.ok(~err.message.indexOf('socket error'));

            innerDone(err, outerDone, function(err) {
              assert.ok(~err.message.indexOf('socket error'));
            });
          });

          connection.execSql(request);
          connection.socket.emit('error', new Error('socket error'));
        });
      });
    });
  });

  it('should test transaction helper isolation level', function(done) {
    const connection = new Connection(config);
    connection.on('end', (info) => done());
    //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
    //  connection.on('debug', (message) => console.log(message) if (debug))

    connection.on('connect', function(err) {
      connection.transaction(function(err, outerDone) {
        assert.ifError(err);

        let request = new Request(
          'SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID',
          function(err) {
            assert.ifError(err);

            connection.transaction(function(err, innerDone) {
              assert.ifError(err);

              request = new Request(
                'SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID',
                function(err) {
                  assert.ifError(err);

                  innerDone(null, outerDone, function(err) {
                    request = new Request(
                      'SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID',
                      function(err) {
                        assert.ifError(err);

                        connection.close();
                      }
                    );

                    request.on('row', function(row) {
                      assert.equal(
                        row[0].value,
                        Transaction.ISOLATION_LEVEL.SERIALIZABLE
                      );
                    });

                    connection.execSqlBatch(request);
                  });
                }
              );

              request.on('row', function(row) {
                assert.equal(
                  row[0].value,
                  Transaction.ISOLATION_LEVEL.SERIALIZABLE
                );
              });

              connection.execSqlBatch(request);
            }, Transaction.ISOLATION_LEVEL.SERIALIZABLE);
          }
        );

        request.on('row', function(row) {
          assert.equal(
            row[0].value,
            Transaction.ISOLATION_LEVEL.REPEATABLE_READ
          );
        });

        connection.execSqlBatch(request);
      }, Transaction.ISOLATION_LEVEL.REPEATABLE_READ);
    });
  });

  it('should test transaction helper reset open transaction count', function(done) {
    const connection = new Connection(config);
    connection.on('end', (info) => done());
    //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
    //  connection.on('debug', (message) => console.log(message) if (debug))

    connection.on('connect', function(err) {
      connection.transaction(function(err) {
        assert.ifError(err);

        connection.reset(function(err) {
          assert.ifError(err);

          assert.strictEqual(connection.inTransaction, false);
          connection.close();
        });
      });
    });
  });

  it('should test transaction helper mixed with low level transaction methods', function(done) {
    const connection = new Connection(config);
    connection.on('end', (info) => done());
    //  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
    //  connection.on('debug', (message) => console.log(message) if (debug))

    connection.on('connect', function(err) {
      connection.beginTransaction(function(err) {
        assert.ifError(err);

        assert.strictEqual(connection.inTransaction, true);

        connection.transaction(function(err, txDone) {
          assert.ifError(err);

          assert.strictEqual(connection.inTransaction, true);

          connection.beginTransaction(function(err) {
            assert.ifError(err);

            assert.strictEqual(connection.inTransaction, true);

            connection.commitTransaction(function(err) {
              assert.ifError(err);

              assert.strictEqual(connection.inTransaction, true);

              txDone(null, function(err) {
                assert.strictEqual(connection.inTransaction, true);

                connection.commitTransaction(function(err) {
                  assert.ifError(err);

                  assert.strictEqual(connection.inTransaction, false);

                  connection.close();
                });
              });
            });
          });
        });
      });
    });
  });
});
