var tedious = require("../../lib/tedious");
var Request = tedious.Request;
var TYPES = tedious.TYPES;

var common = require("../common");

common.createBenchmark({
  name: "inserting varbinary(max) with 4 bytes",

  setup: function(connection, cb) {
    var request = new Request("CREATE TABLE #benchmark ([value] varbinary(max))", function(err) {
      if (err) return cb(err);

      var request = new Request("INSERT INTO #benchmark ([value]) VALUES (@value)", cb);
      request.addParameter("value", TYPES.VarBinary, new Buffer("asdf"));
      connection.execSql(request);
    });

    connection.execSqlBatch(request);
  },

  exec: function(connection, cb) {
    var request = new Request("SELECT * FROM #benchmark", cb);
    connection.execSql(request);
  },

  teardown: function(connection, cb) {
    var request = new Request("DROP TABLE #benchmark", cb);
    connection.execSqlBatch(request);
  }
});
