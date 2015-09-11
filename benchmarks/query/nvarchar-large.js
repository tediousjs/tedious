var tedious = require("../../lib/tedious");
var Request = tedious.Request;
var TYPES = tedious.TYPES;

var common = require("../common");

var connection;
common.createBenchmark({
  name: "inserting nvarchar(max) with 5242880 chars",

  profileIterations: 100,

  setup: function(cb) {
    common.createConnection(function(_connection) {
      connection = _connection;

      var request = new Request("CREATE TABLE #benchmark ([value] nvarchar(max))", function(err) {
        if (err) return cb(err);

        var request = new Request("INSERT INTO #benchmark ([value]) VALUES (@value)", cb);
        request.addParameter("value", TYPES.NVarChar, new Array(5 * 1024 * 1024).join("x"));
        connection.execSql(request);
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
