const Connection = require('../../src/connection');
const Request = require('../../src/request');
const TYPES = require('../../src/data-type').typeByName;
const fs = require('fs');
const config = JSON.parse(
  fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
).config;


for (const value of [100, -100, 922337203685477, -922337203685477])
{
  exports[`testMoneyValue${value}`] = function(test)
  {
    testMoneyValue(test, value, value);
  };
}

function testMoneyValue(test, inputValue, expectValue)
{
  const sql = 'select @v1;';
  var request = new Request(sql, function(err)
  {
    test.ifError(err);
    connection.close();
  });
  request.addParameter('v1', TYPES.Money, inputValue);

  request.on('row', (data) =>
  {
    test.equal(data[0].value, expectValue);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err)
  {
    test.ifError(err);
    connection.execSql(request);
  });

  connection.on('end', function(info)
  {
    test.done();
  });

  connection.on('errorMessage', function(error)
  {
    console.log(`${error.number} : ${error.message}`);
  });

  connection.on('debug', function(message)
  {
    console.log(message);
  });
}
