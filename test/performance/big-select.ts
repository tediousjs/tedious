import Connection from '../../src/connection';
import Request from '../../src/request';
import * as fs from 'fs';
import * as async from 'async';
import * as os from 'os';

interface TestContext {
  expect(count: number): void;
  strictEqual(actual: any, expected: any): void;
  ok(value: any): void;
  done(): void;
}

function getConfig(): any {
  return JSON.parse(
    fs.readFileSync(os.homedir() + '/.tedious/test-connection.json', 'utf8')
  ).config;
}

export function smallRows(test: TestContext): void {
  const rows = 50000;

  const createTableSql =
    'create table #many_rows (id int, first_name varchar(20), last_name varchar(20))';
  const insertRowSql =
    "\
insert into #many_rows (id, first_name, last_name) values(@count, 'MyFirstName', 'YourLastName')\
";

  createInsertSelect(test, rows, createTableSql, insertRowSql);
}

export function mediumRows(test: TestContext): void {
  const rows = 2000;

  let medium = '';
  for (let i = 1; i <= 8000; i++) {
    medium += 'x';
  }

  const createTableSql =
    'create table #many_rows (id int, first_name varchar(20), last_name varchar(20), medium varchar(8000))';
  const insertRowSql = `\
insert into #many_rows (id, first_name, last_name, medium) values(@count, 'MyFirstName', 'YourLastName', '${medium}')\
`;

  createInsertSelect(test, rows, createTableSql, insertRowSql);
}

function createInsertSelect(test: TestContext, rows: number, createTableSql: string, insertRowSql: string): void {
  test.expect(2);

  const insertRowsSql = `\
declare @count int
set @count = ${rows}

while @count > 0
begin
  ${insertRowSql}
  set @count = @count - 1
end\
`;
  const selectSql = 'select * from #many_rows';

  const config = getConfig();
  const connection = new Connection(config);

  function createTable(callback: (err?: Error) => void): void {
    const request = new Request(createTableSql, function(err: any) {
      callback(err);
    });

    console.log('Creating table');
    connection.execSqlBatch(request);
  }

  function insertRows(callback: (err?: Error) => void): void {
    const request = new Request(insertRowsSql, function(err: any) {
      callback(err);
    });

    console.log('Inserting rows');
    connection.execSqlBatch(request);
  }

  function select(callback: (err?: Error) => void): void {
    const start = Date.now();
    const request = new Request(selectSql, function(err: any, rowCount: any) {
      test.strictEqual(rows, rowCount);

      const durationMillis = Date.now() - start;
      console.log(`Took ${durationMillis / 1000}s`);
      console.log(`${rows / (durationMillis / 1000)} rows/sec`);
      console.log(
        `${rows * insertRowSql.length / (durationMillis / 1000)} bytes/sec`
      );

      callback(err);
    });

    request.on('row', function(columns: any) {
      // console.log(columns[0].value)
    });

    console.log('Selecting rows');
    connection.execSqlBatch(request);
  }

  connection.connect(function(err: any) {
    test.ok(!err);

    async.series([
      createTable,
      insertRows,
      select,
      function() {
        connection.close();
      },
    ]);
  });

  connection.on('end', function() {
    test.done();
  });

  connection.on('infoMessage', function(info: any) {
    // console.log("#{info.number} : #{info.message}")
  });

  connection.on('errorMessage', function(error: any) {
    // console.log("#{error.number} : #{error.message}")
  });

  connection.on('debug', function(text: any) {
    // console.log(text)
  });
}
