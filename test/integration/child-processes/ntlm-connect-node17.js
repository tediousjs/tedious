const { Connection, Request } = require('../../../');
const fs = require('fs');
const homedir = require('os').homedir();

function getNtlmConfig() {
  return JSON.parse(
    fs.readFileSync(homedir + '/.tedious/test-connection.json', 'utf8')
  ).ntlm;
}

const request = new Request('select 1; select 2;', function(err, rowCount) {
  if (err) {
    throw err;
  }
  connection.close();
});


const ntlmConfig = getNtlmConfig();

const connection = new Connection(ntlmConfig);

connection.connect(function(err) {
  if (err) {
    if (err instanceof AggregateError) {
      throw err.errors;
    } else {
      throw err;
    }
  }

  connection.execSql(request);
});
