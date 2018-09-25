var tedious = require("../../lib/tedious");
var Request = tedious.Request;
var TYPES = tedious.TYPES;

var common = require("../common");

var connection;
common.createBenchmark({
  name: "inserting varbinary(4) with 4 bytes",

  setup: function(cb) {
    common.createConnection(function(_connection) {
      connection = _connection;

      var request = new Request("CREATE TABLE #benchmark ([value] varbinary(4))", function(err) {
        if (err) return cb(err);

        var request = new Request("INSERT INTO #benchmark ([value]) VALUES (@value)", cb);
        request.addParameter("value", TYPES.VarBinary, Buffer.from("asdf"));
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
