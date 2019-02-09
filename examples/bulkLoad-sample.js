/*
Sample for bulk insert
 - with options that enables nullable default column

TSQL for table used:
	CREATE TABLE [dbo].[test_bulk](
	[c1] [int]  DEFAULT 58,
	[c2] [varchar](30)
	)
    GO
*/

var Connection = require('tedious').Connection,
  TYPES = require('tedious').TYPES;

var connection = new Connection({
  server: '192.168.1.212',
  authentication: {
    type: 'default',
    options: {
      userName: 'test',
      password: 'test'
    }
  }
});

const table = '[dbo].[test_bulk]';

function loadBulkData() {
  var option = { keepNulls: true }; // option to honor null
  var bulkLoad = connection.newBulkLoad(table, option, function(err, rowCont) {
    if (err) {
      throw err;
    }
    console.log('rows inserted :', rowCont);
    connection.close();
  });
  // setup columns
  bulkLoad.addColumn('c1', TYPES.Int, { nullable: true });
  bulkLoad.addColumn('c2', TYPES.NVarChar, { length: 50, nullable: true });

  // add rows
  bulkLoad.addRow({ c2: 'hello' });
  bulkLoad.addRow({ c2: 'bulkLoad' });

  // perform bulk insert
  connection.execBulkLoad(bulkLoad);
}

connection.on('connect', function(err) {
  if (err) {
    console.log('Connection Failed');
    throw err;
  }
  loadBulkData();
});
