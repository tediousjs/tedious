var tedious = require("../../lib/tedious");
var Request = tedious.Request;
var TYPES = tedious.TYPES;
var async = require("async");

var common = require("../common");

var connection;
common.createBenchmark({
  name: "Many result rows",
  profileIterations: 10,

  setup: function(cb) {
    common.createConnection(function(_connection) {
      connection = _connection;

      var request = new Request("CREATE TABLE #benchmark ([id] int IDENTITY(1,1), [name] nvarchar(100), [description] nvarchar(max))", function(err) {
        if (err) return cb(err);

        async.timesSeries(10000, function(n, next) {
          var request = new Request("INSERT INTO #benchmark ([name], [description]) VALUES (@name, @description)", next);

          request.addParameter("name", TYPES.NVarChar, "Row " + n);
          request.addParameter("description", TYPES.NVarChar, "Example Test Description for Row " + n);

          connection.execSql(request);
        }, cb);
      });

      connection.execSqlBatch(request);
    });
  },

  exec: function(cb) {
    var request = new Request("SELECT * FROM #benchmark", cb);
    connection.execSql(request);
  },

  teardown: function(cb) {
    var request = new Request("DROP TABLE #benchmark", function(err) {
      if (err) {
        return cb(err);
      }

      connection.close();
    });
    connection.execSqlBatch(request);
  }
});
