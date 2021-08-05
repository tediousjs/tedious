// @ts-check

const fs = require('fs');
const { pipeline, Readable } = require('stream');
const assert = require('chai').assert;

const TYPES = require('../../src/data-type').typeByName;

import Connection from '../../src/connection';
import { RequestError } from '../../src/errors';
import Request from '../../src/request';

const debugMode = false;

function getConfig() {
  const { config } = JSON.parse(
    fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
  );

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

  config.options.cancelTimeout = 1000;

  if (debugMode) {
    config.options.debug = {
      packet: true,
      data: true,
      payload: true,
      token: true
    };
  }

  return config;
}

describe('BulkLoad', function() {
  /**
   * @type {Connection}
   */
  let connection;

  beforeEach(function(done) {
    connection = new Connection(getConfig());
    connection.connect(done);

    if (debugMode) {
      connection.on('debug', (message) => console.log(message));
      connection.on('infoMessage', (info) =>
        console.log('Info: ' + info.number + ' - ' + info.message)
      );
      connection.on('errorMessage', (error) =>
        console.log('Error: ' + error.number + ' - ' + error.message)
      );
    }
  });

  afterEach(function(done) {
    if (!connection.closed) {
      connection.on('end', done);
      connection.close();
    } else {
      done();
    }
  });

  it('allows bulk loading multiple rows', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable', (err, rowCount) => {
      if (err) {
        return done(err);
      }

      assert.strictEqual(rowCount, 5, 'Incorrect number of rows inserted.');

      done();
    });

    bulkLoad.addColumn('nnn', TYPES.Int, { nullable: false });
    bulkLoad.addColumn('sss', TYPES.NVarChar, { length: 50, nullable: true });
    bulkLoad.addColumn('ddd', TYPES.DateTime, { nullable: false });

    const request = new Request(bulkLoad.getTableCreationSql(), (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({ nnn: 201, sss: 'one zero one', ddd: new Date(1986, 6, 20) });
      bulkLoad.addRow([202, 'one zero two', new Date()]);
      bulkLoad.addRow(203, 'one zero three', new Date(2013, 7, 12));
      bulkLoad.addRow({ nnn: 204, sss: 'one zero four', ddd: new Date() });
      bulkLoad.addRow({ nnn: 205, sss: 'one zero five', ddd: new Date() });

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(request);
  });

  describe('.addColumn', function() {
    it('throws an error if called after first row has been written', function(done) {
      const bulkLoad = connection.newBulkLoad('#tmpTestTable2', (err, rowCount) => {
        assert.isUndefined(err);

        assert.strictEqual(rowCount, 1);

        done();
      });

      bulkLoad.addColumn('x', TYPES.Int, { nullable: false });
      bulkLoad.addColumn('y', TYPES.Int, { nullable: false });

      const request = new Request(bulkLoad.getTableCreationSql(), (err) => {
        if (err) {
          return done(err);
        }

        bulkLoad.addRow({ x: 1, y: 1 });

        assert.throws(() => {
          bulkLoad.addColumn('z', TYPES.Int, { nullable: false });
        }, Error, 'Columns cannot be added to bulk insert after the first row has been written.');

        connection.execBulkLoad(bulkLoad);
      });

      connection.execSqlBatch(request);
    });

    it('throws an error if called after streaming bulk load has started', function(done) {
      const bulkLoad = connection.newBulkLoad('#tmpTestTable2', (err, rowCount) => {
        assert.isUndefined(err);

        assert.strictEqual(rowCount, 1);

        done();
      });

      bulkLoad.addColumn('x', TYPES.Int, { nullable: false });
      bulkLoad.addColumn('y', TYPES.Int, { nullable: false });

      const request = new Request(bulkLoad.getTableCreationSql(), (err) => {
        if (err) {
          return done(err);
        }

        connection.execBulkLoad(bulkLoad, (function*() {
          yield [1, 1];

          assert.throws(() => {
            bulkLoad.addColumn('z', TYPES.Int, { nullable: false });
          }, Error, 'Columns cannot be added to bulk insert after execution has started.');
        })());
      });

      connection.execSqlBatch(request);
    });
  });

  describe('.getRowStream', function() {
    it('throws an error if called after first row has been written', function(done) {
      const bulkLoad = connection.newBulkLoad('#tmpTestTable2', (err, rowCount) => {
        assert.isUndefined(err);

        assert.strictEqual(rowCount, 1);

        done();
      });

      bulkLoad.addColumn('x', TYPES.Int, { nullable: false });
      bulkLoad.addColumn('y', TYPES.Int, { nullable: false });

      const request = new Request(bulkLoad.getTableCreationSql(), (err) => {
        if (err) {
          return done(err);
        }

        bulkLoad.addRow({ x: 1, y: 1 });

        assert.throws(() => {
          bulkLoad.getRowStream();
        }, Error, 'BulkLoad cannot be switched to streaming mode after first row has been written using addRow().');

        connection.execBulkLoad(bulkLoad);
      });

      connection.execSqlBatch(request);
    });

    it('throws an error if called after streaming bulk load has started', function(done) {
      const bulkLoad = connection.newBulkLoad('#tmpTestTable2', (err, rowCount) => {
        assert.isUndefined(err);

        assert.strictEqual(rowCount, 1);

        done();
      });

      bulkLoad.addColumn('x', TYPES.Int, { nullable: false });
      bulkLoad.addColumn('y', TYPES.Int, { nullable: false });

      const request = new Request(bulkLoad.getTableCreationSql(), (err) => {
        if (err) {
          return done(err);
        }

        connection.execBulkLoad(bulkLoad, (function*() {
          yield [1, 1];

          assert.throws(() => {
            bulkLoad.getRowStream();
          }, Error, 'BulkLoad cannot be switched to streaming mode after execution has started.');
        })());
      });

      connection.execSqlBatch(request);
    });
  });

  it('fails if the column definition does not match the target table format', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable2', (err, rowCount) => {
      assert.instanceOf(err, RequestError, 'An error should have been thrown to indicate the incorrect table format.');
      assert.strictEqual(/** @type {RequestError} */(err).message, 'An unknown error has occurred. This is likely because the schema of the BulkLoad does not match the schema of the table you are attempting to insert into.');

      assert.isUndefined(rowCount);

      done();
    });

    bulkLoad.addColumn('x', TYPES.Int, { nullable: false });
    bulkLoad.addColumn('y', TYPES.Int, { nullable: false });

    const request = new Request('CREATE TABLE #tmpTestTable2 ([id] int not null)', (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({ x: 1, y: 1 });

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(request);
  });

  it('checks constraints if the `checkConstraints` option is set to `true`', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable3', { checkConstraints: true }, (err, rowCount) => {
      assert.ok(err, 'An error should have been thrown to indicate the conflict with the CHECK constraint.');

      assert.strictEqual(rowCount, 0);

      done();
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: true });

    const request = new Request('CREATE TABLE #tmpTestTable3 ([id] int,  CONSTRAINT chk_id CHECK (id BETWEEN 0 and 50 ))', (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({ id: 50 });
      bulkLoad.addRow({ id: 555 });
      bulkLoad.addRow({ id: 5 });

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(request);
  });

  it('fires triggers if the `fireTriggers` option is set to `true`', function(done) {
    const bulkLoad = connection.newBulkLoad('testTable4', { fireTriggers: true }, (err, rowCount) => {
      if (err) {
        return done(err);
      }

      connection.execSql(verifyTriggerRequest);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: true });

    const createTable = 'CREATE TABLE testTable4 ([id] int);';
    const createTrigger = `
      CREATE TRIGGER bulkLoadTest on testTable4
      AFTER INSERT
      AS
      INSERT INTO testTable4 SELECT * FROM testTable4;
    `;
    const verifyTrigger = 'SELECT COUNT(*) FROM testTable4';
    const dropTable = 'DROP TABLE testTable4';

    const createTableRequest = new Request(createTable, (err) => {
      if (err) {
        return done(err);
      }

      connection.execSql(createTriggerRequest);
    });

    const createTriggerRequest = new Request(createTrigger, (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({
        id: 555
      });

      connection.execBulkLoad(bulkLoad);
    });

    const verifyTriggerRequest = new Request(verifyTrigger, (err) => {
      if (err) {
        return done(err);
      }

      connection.execSql(dropTableRequest);
    });

    const dropTableRequest = new Request(dropTable, (err) => {
      if (err) {
        return done(err);
      }

      done();
    });

    verifyTriggerRequest.on('row', (columns) => {
      assert.deepEqual(columns[0].value, 2);
    });

    connection.execSql(createTableRequest);
  });

  it('should not replace `null` values with column defaults if `keepNulls` is set to `true`', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, (err, rowCount) => {
      if (err) {
        return done(err);
      }

      connection.execSqlBatch(verifyBulkLoadRequest);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: true });

    const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({ id: null });

      connection.execBulkLoad(bulkLoad);
    });

    const verifyBulkLoadRequest = new Request('SELECT [id] FROM #tmpTestTable5', (err) => {
      if (err) {
        return done(err);
      }

      done();
    });

    verifyBulkLoadRequest.on('row', (columns) => {
      assert.deepEqual(columns[0].value, null);
    });

    connection.execSqlBatch(request);
  });

  describe('`order` option', function() {
    it('allows specifying the order for bulk loaded data', function(done) {
      const bulkLoad = connection.newBulkLoad('#tmpTestTable', { order: { 'id': 'ASC' } }, (err, rowCount) => {
        assert.isUndefined(err);

        assert.strictEqual(rowCount, 6);

        done();
      });

      bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
      bulkLoad.addColumn('name', TYPES.NVarChar, { nullable: false });

      const request = new Request(`
        CREATE TABLE "#tmpTestTable" (
          "id" int NOT NULL,
          "name" nvarchar(255) NOT NULL,
          PRIMARY KEY CLUSTERED ("id")
        )
      `, (err) => {
        if (err) {
          return done(err);
        }

        bulkLoad.addRow({ id: 1, name: 'Bulbasaur' });
        bulkLoad.addRow({ id: 2, name: 'Ivysaur' });
        bulkLoad.addRow({ id: 3, name: 'Venusaur' });

        bulkLoad.addRow({ id: 4, name: 'Charmander' });
        bulkLoad.addRow({ id: 5, name: 'Charmeleon' });
        bulkLoad.addRow({ id: 6, name: 'Charizard' });

        connection.execBulkLoad(bulkLoad);
      });

      connection.execSqlBatch(request);
    });

    it('is ignored if the value is `undefined`', function(done) {
      const bulkLoad = connection.newBulkLoad('#tmpTestTable', { order: undefined }, (err, rowCount) => {
        assert.isUndefined(err);

        assert.strictEqual(rowCount, 6);

        done();
      });

      bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
      bulkLoad.addColumn('name', TYPES.NVarChar, { nullable: false });

      const request = new Request(`
        CREATE TABLE "#tmpTestTable" (
          "id" int NOT NULL,
          "name" nvarchar(255) NOT NULL,
          PRIMARY KEY CLUSTERED ("id")
        )
      `, (err) => {
        if (err) {
          return done(err);
        }

        bulkLoad.addRow({ id: 1, name: 'Bulbasaur' });
        bulkLoad.addRow({ id: 2, name: 'Ivysaur' });
        bulkLoad.addRow({ id: 3, name: 'Venusaur' });

        bulkLoad.addRow({ id: 4, name: 'Charmander' });
        bulkLoad.addRow({ id: 5, name: 'Charmeleon' });
        bulkLoad.addRow({ id: 6, name: 'Charizard' });

        connection.execBulkLoad(bulkLoad);
      });

      connection.execSqlBatch(request);
    });

    it('throws an error if the value is invalid', function() {
      assert.throws(() => {
        connection.newBulkLoad('#tmpTestTable', /** @type {any} */({ order: 'foo' }), () => {});
      }, 'The "options.order" property must be of type object.');

      assert.throws(() => {
        connection.newBulkLoad('#tmpTestTable', /** @type {any} */({ order: null }), () => {});
      }, 'The "options.order" property must be of type object.');

      assert.throws(() => {
        connection.newBulkLoad('#tmpTestTable', /** @type {any} */({ order: 123 }), () => {});
      }, 'The "options.order" property must be of type object.');

      assert.throws(() => {
        connection.newBulkLoad('#tmpTestTable', /** @type {any} */({ order: { foo: 'bar' } }), () => {});
      }, 'The value of the "foo" key in the "options.order" object must be either "ASC" or "DESC".');
    });

    it('aborts the bulk load if data is provided in a different order than specified', function(done) {
      const bulkLoad = connection.newBulkLoad('#tmpTestTable', { order: { 'id': 'ASC' } }, (err, rowCount) => {
        const expectedMessage = [
          'Cannot bulk load.',
          'The bulk data stream was incorrectly specified as sorted or the data violates a uniqueness constraint imposed by the target table.',
          'Sort order incorrect for the following two rows: primary key of first row: (6), primary key of second row: (5).'
        ].join(' ');

        assert.instanceOf(err, RequestError);
        assert.strictEqual(/** @type {RequestError} */(err).message, expectedMessage);

        assert.strictEqual(rowCount, 0);

        done();
      });

      bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
      bulkLoad.addColumn('name', TYPES.NVarChar, { nullable: false });

      const request = new Request(`
        CREATE TABLE "#tmpTestTable" (
          "id" int NOT NULL,
          "name" nvarchar(255) NOT NULL,
          PRIMARY KEY CLUSTERED ("id")
        )
      `, (err) => {
        if (err) {
          return done(err);
        }

        bulkLoad.addRow({ id: 1, name: 'Bulbasaur' });
        bulkLoad.addRow({ id: 2, name: 'Ivysaur' });
        bulkLoad.addRow({ id: 3, name: 'Venusaur' });

        bulkLoad.addRow({ id: 6, name: 'Charizard' });
        bulkLoad.addRow({ id: 5, name: 'Charmeleon' });
        bulkLoad.addRow({ id: 4, name: 'Charmander' });

        connection.execBulkLoad(bulkLoad);
      });

      connection.execSqlBatch(request);
    });

    it('ignores the order if the target table does not have a clustered key', function(done) {
      const bulkLoad = connection.newBulkLoad('#tmpTestTable', { order: { 'id': 'ASC' } }, (err, rowCount) => {
        assert.isUndefined(err);

        assert.strictEqual(rowCount, 6);

        done();
      });

      bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
      bulkLoad.addColumn('name', TYPES.NVarChar, { nullable: false });

      const request = new Request(`
        CREATE TABLE "#tmpTestTable" (
          "id" int NOT NULL,
          "name" nvarchar(255) NOT NULL
        )
      `, (err) => {
        if (err) {
          return done(err);
        }

        bulkLoad.addRow({ id: 1, name: 'Bulbasaur' });
        bulkLoad.addRow({ id: 2, name: 'Ivysaur' });
        bulkLoad.addRow({ id: 3, name: 'Venusaur' });

        bulkLoad.addRow({ id: 6, name: 'Charizard' });
        bulkLoad.addRow({ id: 5, name: 'Charmeleon' });
        bulkLoad.addRow({ id: 4, name: 'Charmander' });

        connection.execBulkLoad(bulkLoad);
      });

      connection.execSqlBatch(request);
    });

    it("ignores the order if the target table's clustered key and the specified order don't match", function(done) {
      const bulkLoad = connection.newBulkLoad('#tmpTestTable', { order: { 'name': 'ASC' } }, (err, rowCount) => {
        assert.isUndefined(err);

        assert.strictEqual(rowCount, 6);

        done();
      });

      bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
      bulkLoad.addColumn('name', TYPES.NVarChar, { nullable: false });

      const request = new Request(`
        CREATE TABLE "#tmpTestTable" (
          "id" int NOT NULL,
          "name" nvarchar(255) NOT NULL,
          PRIMARY KEY CLUSTERED ("name")
        )
      `, (err) => {
        if (err) {
          return done(err);
        }

        bulkLoad.addRow({ id: 1, name: 'Bulbasaur' });
        bulkLoad.addRow({ id: 2, name: 'Ivysaur' });
        bulkLoad.addRow({ id: 3, name: 'Venusaur' });

        bulkLoad.addRow({ id: 6, name: 'Charizard' });
        bulkLoad.addRow({ id: 5, name: 'Charmeleon' });
        bulkLoad.addRow({ id: 4, name: 'Charmander' });

        connection.execBulkLoad(bulkLoad);
      });

      connection.execSqlBatch(request);
    });
  });

  it('does not insert any rows if `cancel` is called immediately after executing the bulk load', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, (err, rowCount) => {
      assert.instanceOf(err, RequestError);
      assert.strictEqual(/** @type {RequestError} */(err).message, 'Canceled.');

      assert.isUndefined(rowCount);

      connection.execSqlBatch(verifyBulkLoadRequest);
    });

    bulkLoad.addColumn('id', TYPES.Int, {
      nullable: true
    });

    const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', (err) => {
      if (err) {
        return done(err);
      }
      bulkLoad.addRow({ id: 1234 });

      connection.execBulkLoad(bulkLoad);

      bulkLoad.cancel();
    });

    const verifyBulkLoadRequest = new Request('SELECT [id] FROM #tmpTestTable5', (err, rowCount) => {
      if (err) {
        return done(err);
      }

      assert.strictEqual(rowCount, 0);

      done();
    });

    verifyBulkLoadRequest.on('row', (columns) => {
      assert.deepEqual(columns[0].value, null);
    });

    connection.execSqlBatch(request);
  });

  it('should not do anything if canceled after completion', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, (err, rowCount) => {
      if (err) {
        return done(err);
      }

      bulkLoad.cancel();

      connection.execSqlBatch(verifyBulkLoadRequest);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: true });

    const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({ id: 1234 });

      connection.execBulkLoad(bulkLoad);
    });

    const verifyBulkLoadRequest = new Request('SELECT [id] FROM #tmpTestTable5', (err, rowCount) => {
      if (err) {
        return done(err);
      }

      assert.strictEqual(rowCount, 1);

      done();
    });

    verifyBulkLoadRequest.on('row', function(columns) {
      assert.strictEqual(columns[0].value, 1234);
    });

    connection.execSqlBatch(request);
  });

  it('supports streaming bulk load rows from a Stream', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable', (err, rowCount) => {
      if (err) {
        done(err);
      }

      assert.strictEqual(rowCount, 6);

      /** @type {unknown[]} */
      const results = [];
      const request = new Request(`
        SELECT id, name FROM #tmpTestTable ORDER BY id
      `, (err) => {
        if (err) {
          done(err);
        }

        assert.deepEqual(results, [
          { id: 1, name: 'Bulbasaur' },
          { id: 2, name: 'Ivysaur' },
          { id: 3, name: 'Venusaur' },

          { id: 4, name: 'Charmander' },
          { id: 5, name: 'Charmeleon' },
          { id: 6, name: 'Charizard' }
        ]);

        done();
      });

      request.on('row', (row) => {
        results.push({ id: row[0].value, name: row[1].value });
      });

      connection.execSql(request);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
    bulkLoad.addColumn('name', TYPES.NVarChar, { nullable: false });

    const request = new Request(`
      CREATE TABLE "#tmpTestTable" (
        "id" int NOT NULL,
        "name" nvarchar(255) NOT NULL,
        PRIMARY KEY CLUSTERED ("id")
      )
    `, (err) => {
      if (err) {
        return done(err);
      }

      connection.execBulkLoad(bulkLoad, Readable.from([
        { id: 1, name: 'Bulbasaur' },
        [2, 'Ivysaur'],
        { id: 3, name: 'Venusaur' },

        [4, 'Charmander'],
        { id: 5, name: 'Charmeleon' },
        [6, 'Charizard']
      ]));
    });

    connection.execSqlBatch(request);
  });

  it('supports streaming bulk load rows from an Array', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable', (err, rowCount) => {
      if (err) {
        done(err);
      }

      assert.strictEqual(rowCount, 6);

      /** @type {unknown[]} */
      const results = [];
      const request = new Request(`
        SELECT id, name FROM #tmpTestTable ORDER BY id
      `, (err) => {
        if (err) {
          done(err);
        }

        assert.deepEqual(results, [
          { id: 1, name: 'Bulbasaur' },
          { id: 2, name: 'Ivysaur' },
          { id: 3, name: 'Venusaur' },

          { id: 4, name: 'Charmander' },
          { id: 5, name: 'Charmeleon' },
          { id: 6, name: 'Charizard' }
        ]);

        done();
      });

      request.on('row', (row) => {
        results.push({ id: row[0].value, name: row[1].value });
      });

      connection.execSql(request);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
    bulkLoad.addColumn('name', TYPES.NVarChar, { nullable: false });

    const request = new Request(`
      CREATE TABLE "#tmpTestTable" (
        "id" int NOT NULL,
        "name" nvarchar(255) NOT NULL,
        PRIMARY KEY CLUSTERED ("id")
      )
    `, (err) => {
      if (err) {
        return done(err);
      }

      connection.execBulkLoad(bulkLoad, [
        { id: 1, name: 'Bulbasaur' },
        [2, 'Ivysaur'],
        { id: 3, name: 'Venusaur' },

        [4, 'Charmander'],
        { id: 5, name: 'Charmeleon' },
        [6, 'Charizard']
      ]);
    });

    connection.execSqlBatch(request);
  });

  it('supports streaming bulk load rows from an Iterable', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable', (err, rowCount) => {
      if (err) {
        done(err);
      }

      assert.strictEqual(rowCount, 6);

      /** @type {unknown[]} */
      const results = [];
      const request = new Request(`
        SELECT id, name FROM #tmpTestTable ORDER BY id
      `, (err) => {
        if (err) {
          done(err);
        }

        assert.deepEqual(results, [
          { id: 1, name: 'Bulbasaur' },
          { id: 2, name: 'Ivysaur' },
          { id: 3, name: 'Venusaur' },

          { id: 4, name: 'Charmander' },
          { id: 5, name: 'Charmeleon' },
          { id: 6, name: 'Charizard' }
        ]);

        done();
      });

      request.on('row', (row) => {
        results.push({ id: row[0].value, name: row[1].value });
      });

      connection.execSql(request);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
    bulkLoad.addColumn('name', TYPES.NVarChar, { nullable: false });

    const request = new Request(`
      CREATE TABLE "#tmpTestTable" (
        "id" int NOT NULL,
        "name" nvarchar(255) NOT NULL,
        PRIMARY KEY CLUSTERED ("id")
      )
    `, (err) => {
      if (err) {
        return done(err);
      }

      connection.execBulkLoad(bulkLoad, (function*() {
        yield { id: 1, name: 'Bulbasaur' };
        yield [2, 'Ivysaur'];
        yield { id: 3, name: 'Venusaur' };

        yield [4, 'Charmander'];
        yield { id: 5, name: 'Charmeleon' };
        yield [6, 'Charizard'];
      })());
    });

    connection.execSqlBatch(request);
  });

  it('supports streaming bulk load rows from an AsyncIterable', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable', (err, rowCount) => {
      if (err) {
        done(err);
      }

      assert.strictEqual(rowCount, 6);

      /** @type {unknown[]} */
      const results = [];
      const request = new Request(`
        SELECT id, name FROM #tmpTestTable ORDER BY id
      `, (err) => {
        if (err) {
          done(err);
        }

        assert.deepEqual(results, [
          { id: 1, name: 'Bulbasaur' },
          { id: 2, name: 'Ivysaur' },
          { id: 3, name: 'Venusaur' },

          { id: 4, name: 'Charmander' },
          { id: 5, name: 'Charmeleon' },
          { id: 6, name: 'Charizard' }
        ]);

        done();
      });

      request.on('row', (row) => {
        results.push({ id: row[0].value, name: row[1].value });
      });

      connection.execSql(request);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
    bulkLoad.addColumn('name', TYPES.NVarChar, { nullable: false });

    const request = new Request(`
      CREATE TABLE "#tmpTestTable" (
        "id" int NOT NULL,
        "name" nvarchar(255) NOT NULL,
        PRIMARY KEY CLUSTERED ("id")
      )
    `, (err) => {
      if (err) {
        return done(err);
      }

      connection.execBulkLoad(bulkLoad, (async function*() {
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });

        yield { id: 1, name: 'Bulbasaur' };

        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });

        yield [2, 'Ivysaur'];

        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });

        yield { id: 3, name: 'Venusaur' };

        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });

        yield [4, 'Charmander'];

        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });

        yield { id: 5, name: 'Charmeleon' };

        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });

        yield [6, 'Charizard'];

        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
      })());
    });

    connection.execSqlBatch(request);
  });

  it('correctly handles errors being throw inside an AsyncIterable', function(done) {
    const expectedError = new Error('fail');

    const bulkLoad = connection.newBulkLoad('#tmpTestTable', (err, rowCount) => {
      assert.strictEqual(err, expectedError);
      assert.strictEqual(rowCount, 0);

      /** @type {unknown[]} */
      const results = [];
      const request = new Request(`
        SELECT id, name FROM #tmpTestTable ORDER BY id
      `, (err) => {
        if (err) {
          done(err);
        }

        assert.deepEqual(results, []);

        done();
      });

      request.on('row', (row) => {
        results.push({ id: row[0].value, name: row[1].value });
      });

      connection.execSql(request);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
    bulkLoad.addColumn('name', TYPES.NVarChar, { nullable: false });

    const request = new Request(`
      CREATE TABLE "#tmpTestTable" (
        "id" int NOT NULL,
        "name" nvarchar(255) NOT NULL,
        PRIMARY KEY CLUSTERED ("id")
      )
    `, (err) => {
      if (err) {
        return done(err);
      }

      connection.execBulkLoad(bulkLoad, (async function*() {
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });

        yield { id: 1, name: 'Bulbasaur' };

        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });

        yield [2, 'Ivysaur'];

        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });

        yield { id: 3, name: 'Venusaur' };

        throw expectedError;
      })());
    });

    connection.execSqlBatch(request);
  });

  it('throws an error when trying to execute the bulkload with an Iterable after adding rows', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable', (err, rowCount) => {
      assert.fail('Unexpected callback execution');
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
    bulkLoad.addColumn('name', TYPES.NVarChar, { nullable: false });

    const request = new Request(`
      CREATE TABLE "#tmpTestTable" (
        "id" int NOT NULL,
        "name" nvarchar(255) NOT NULL,
        PRIMARY KEY CLUSTERED ("id")
      )
    `, (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({ id: 1, name: 'Bulbasaur' });
      bulkLoad.addRow([2, 'Ivysaur']);
      bulkLoad.addRow({ id: 3, name: 'Venusaur' });

      assert.throws(() => {
        connection.execBulkLoad(bulkLoad, [
          [4, 'Charmander'],
          { id: 5, name: 'Charmeleon' },
          [6, 'Charizard']
        ]);
      }, Error, "Connection.execBulkLoad can't be called with a BulkLoad that already has rows written to it.");

      done();
    });

    connection.execSqlBatch(request);
  });


  it('throws an error when trying to execute the bulkload with an Iterable after switching to streaming mode', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable', (err, rowCount) => {
      assert.fail('Unexpected callback execution');
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
    bulkLoad.addColumn('name', TYPES.NVarChar, { nullable: false });

    const request = new Request(`
      CREATE TABLE "#tmpTestTable" (
        "id" int NOT NULL,
        "name" nvarchar(255) NOT NULL,
        PRIMARY KEY CLUSTERED ("id")
      )
    `, (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.getRowStream();

      assert.throws(() => {
        connection.execBulkLoad(bulkLoad, [
          [4, 'Charmander'],
          { id: 5, name: 'Charmeleon' },
          [6, 'Charizard']
        ]);
      }, Error, "Connection.execBulkLoad can't be called with a BulkLoad that was put in streaming mode.");

      done();
    });

    connection.execSqlBatch(request);
  });


  it('should not close the connection due to cancelTimeout if canceled after completion', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, (err, rowCount) => {
      if (err) {
        return done(err);
      }

      bulkLoad.cancel();

      setTimeout(() => {
        assert.strictEqual(connection.state.name, 'LoggedIn');

        const request = new Request('select 1', done);

        connection.execSql(request);
      }, connection.config.options.cancelTimeout + 100);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: true });

    bulkLoad.addRow({ id: 1234 });

    const createTableRequest = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', (err) => {
      if (err) {
        return done(err);
      }

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(createTableRequest);
  });

  it('supports streaming bulk load inserts', function(done) {
    const totalRows = 20;
    const tableName = '#streamingBulkLoadTest';

    startCreateTable();

    function startCreateTable() {
      const sql = 'create table ' + tableName + ' (i int not null primary key)';
      const request = new Request(sql, (err) => {
        if (err) {
          return done(err);
        }

        startBulkLoad();
      });

      connection.execSqlBatch(request);
    }

    function startBulkLoad() {
      const bulkLoad = connection.newBulkLoad(tableName, completeBulkLoad);
      bulkLoad.addColumn('i', TYPES.Int, { nullable: false });
      const rowStream = bulkLoad.getRowStream();

      connection.execBulkLoad(bulkLoad);

      const rowSource = Readable.from((async function*() {
        let rowCount = 0;
        while (rowCount < totalRows) {
          await new Promise((resolve) => {
            setTimeout(resolve, 10);
          });

          yield [rowCount++];
        }
      })(), { objectMode: true });

      rowSource.pipe(rowStream);
    }

    /**
     * @param {Error | undefined | null} err
     * @param {number | undefined} rowCount
     */
    function completeBulkLoad(err, rowCount) {
      if (err) {
        return done(err);
      }

      assert.equal(rowCount, totalRows);
      startVerifyTableContent();
    }

    function startVerifyTableContent() {
      const request = new Request(`
        select count(*)
        from ${tableName} a
        inner join ${tableName} b on a.i = b.i - 1
      `, completeVerifyTableContent);

      request.on('row', (row) => {
        assert.equal(row[0].value, totalRows - 1);
      });

      connection.execSqlBatch(request);
    }

    /**
     * @param {Error | undefined | null} err
     * @param {number | undefined} rowCount
     */
    function completeVerifyTableContent(err, rowCount) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(rowCount, 1);

      done();
    }
  });

  it('allows using objects or arrays for streaming bulk loads', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable', (err, rowCount) => {
      if (err) {
        done(err);
      }

      assert.strictEqual(rowCount, 6);

      /** @type {unknown[]} */
      const results = [];
      const request = new Request(`
        SELECT id, name FROM #tmpTestTable ORDER BY id
      `, (err) => {
        if (err) {
          done(err);
        }

        assert.deepEqual(results, [
          { id: 1, name: 'Bulbasaur' },
          { id: 2, name: 'Ivysaur' },
          { id: 3, name: 'Venusaur' },

          { id: 4, name: 'Charmander' },
          { id: 5, name: 'Charmeleon' },
          { id: 6, name: 'Charizard' }
        ]);

        done();
      });

      request.on('row', (row) => {
        results.push({ id: row[0].value, name: row[1].value });
      });

      connection.execSql(request);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
    bulkLoad.addColumn('name', TYPES.NVarChar, { nullable: false });

    const request = new Request(`
      CREATE TABLE "#tmpTestTable" (
        "id" int NOT NULL,
        "name" nvarchar(255) NOT NULL,
        PRIMARY KEY CLUSTERED ("id")
      )
    `, (err) => {
      if (err) {
        return done(err);
      }

      Readable.from([
        { id: 1, name: 'Bulbasaur' },
        [ 2, 'Ivysaur' ],
        { id: 3, name: 'Venusaur' },

        [ 4, 'Charmander' ],
        { id: 5, name: 'Charmeleon' },
        [ 6, 'Charizard' ]
      ]).pipe(bulkLoad.getRowStream());

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(request);
  });

  it('supports cancelling a streaming bulk load', function(done) {
    const totalRows = 20;

    startCreateTable();

    function startCreateTable() {
      const sql = 'create table #stream_test (i int not null primary key)';
      const request = new Request(sql, completeCreateTable);
      connection.execSqlBatch(request);
    }

    /**
     * @param {Error | null| undefined} err
     */
    function completeCreateTable(err) {
      if (err) {
        return done(err);
      }

      startBulkLoad();
    }

    function startBulkLoad() {
      const bulkLoad = connection.newBulkLoad('#stream_test', completeBulkLoad);
      bulkLoad.addColumn('i', TYPES.Int, { nullable: false });

      const rowStream = bulkLoad.getRowStream();
      connection.execBulkLoad(bulkLoad);

      let rowCount = 0;
      const rowSource = Readable.from((async function*() {
        while (rowCount < totalRows) {
          if (rowCount === 10) {
            bulkLoad.cancel();
          }

          await new Promise((resolve) => {
            setTimeout(resolve, 10);
          });

          yield [rowCount++];
        }
      })(), { objectMode: true });

      pipeline(rowSource, rowStream, (err) => {
        assert.instanceOf(err, RequestError);
        assert.strictEqual(/** @type {RequestError} */(err).message, 'Canceled.');
        assert.strictEqual(rowCount, 10);
      });
    }

    /**
     * @param {Error | null | undefined} err
     * @param {undefined | number} rowCount
     */
    function completeBulkLoad(err, rowCount) {
      assert.instanceOf(err, RequestError);
      assert.strictEqual(/** @type {RequestError} */(err).message, 'Canceled.');

      assert.strictEqual(rowCount, 0);
      startVerifyTableContent();
    }

    function startVerifyTableContent() {
      const sql = `
        select count(*)
        from #stream_test a
        inner join #stream_test b on a.i = b.i - 1
      `;
      const request = new Request(sql, completeVerifyTableContent);
      request.on('row', (row) => {
        assert.equal(row[0].value, 0);
      });
      connection.execSqlBatch(request);
    }

    /**
     * @param {Error | null | undefined} err
     * @param {undefined | number} rowCount
     */
    function completeVerifyTableContent(err, rowCount) {
      if (err) {
        return done(err);
      }

      assert.equal(rowCount, 1);

      done();
    }
  });

  it('should not close the connection due to cancelTimeout if streaming bulk load is cancelled', function(done) {
    const totalRows = 20;

    const sql = 'create table #stream_test (i int not null primary key)';
    const request = new Request(sql, (err) => {
      if (err) {
        return done(err);
      }

      const bulkLoad = connection.newBulkLoad('#stream_test', (err, rowCount) => {
        assert.instanceOf(err, RequestError);
        assert.strictEqual(/** @type {RequestError} */(err).message, 'Canceled.');

        assert.strictEqual(rowCount, 0);
      });

      bulkLoad.addColumn('i', TYPES.Int, { nullable: false });

      const rowStream = bulkLoad.getRowStream();
      connection.execBulkLoad(bulkLoad);

      let rowCount = 0;
      const rowSource = Readable.from((async function*() {
        while (rowCount < totalRows) {
          if (rowCount === 10) {
            bulkLoad.cancel();

            setTimeout(() => {
              assert.strictEqual(connection.state.name, 'LoggedIn');

              const request = new Request('select 1', done);

              connection.execSql(request);
            }, connection.config.options.cancelTimeout + 100);
          }

          await new Promise((resolve) => {
            setTimeout(resolve, 10);
          });

          yield [rowCount++];
        }
      })(), { objectMode: true });

      pipeline(rowSource, rowStream, (err) => {
        assert.instanceOf(err, RequestError);
        assert.strictEqual(/** @type {RequestError} */(err).message, 'Canceled.');
        assert.strictEqual(rowCount, 10);
      });
    });

    connection.execSqlBatch(request);
  });

  it('cancels any bulk load that takes longer than the given timeout', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, (err, rowCount) => {
      assert.instanceOf(err, RequestError);
      assert.strictEqual(/** @type {RequestError} */(err).message, 'Timeout: Request failed to complete in 10ms');

      done();
    });

    bulkLoad.setTimeout(10);

    bulkLoad.addColumn('id', TYPES.Int, {
      nullable: true
    });

    const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', (err) => {
      if (err) {
        return done(err);
      }

      for (let i = 0; i < 100000; i++) {
        bulkLoad.addRow({ id: 1234 });
      }

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(request);
  });

  it('does nothing if the timeout fires after the bulk load completes', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, (err, rowCount) => {
      assert.isUndefined(err);

      done();
    });

    bulkLoad.setTimeout(2000);

    bulkLoad.addColumn('id', TYPES.Int, {
      nullable: true
    });

    const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', (err) => {
      if (err) {
        return done(err);
      }

      for (let i = 0; i < 100; i++) {
        bulkLoad.addRow({ id: 1234 });
      }

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(request);
  });

  it('cancels any streaming bulk load that takes longer than the given timeout', function(done) {
    startCreateTable();

    function startCreateTable() {
      const sql = 'create table #stream_test (i int not null primary key)';
      const request = new Request(sql, completeCreateTable);
      connection.execSqlBatch(request);
    }

    /**
     * @param {Error | null | undefined} err
     */
    function completeCreateTable(err) {
      if (err) {
        return done(err);
      }

      startBulkLoad();
    }

    function startBulkLoad() {
      const bulkLoad = connection.newBulkLoad('#stream_test', completeBulkLoad);
      bulkLoad.setTimeout(200);

      bulkLoad.addColumn('i', TYPES.Int, { nullable: false });

      const rowStream = bulkLoad.getRowStream();

      connection.execBulkLoad(bulkLoad);

      const rowSource = Readable.from((async function*() {
        yield [1];

        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });

        yield [2];
      })(), { objectMode: true });

      pipeline(rowSource, rowStream, (err) => {
        assert.instanceOf(err, RequestError);
        assert.strictEqual(/** @type {RequestError} */(err).message, 'Canceled.');
      });
    }

    /**
     * @param {Error | null | undefined} err
     * @param {undefined | number} rowCount
     */
    function completeBulkLoad(err, rowCount) {
      assert.instanceOf(err, RequestError);
      assert.strictEqual(/** @type {RequestError} */(err).message, 'Timeout: Request failed to complete in 200ms');

      assert.strictEqual(rowCount, 0);

      done();
    }
  });

  describe('validation errors', function() {
    beforeEach(function(done) {
      const request = new Request('create table #stream_test ([value] date)', (err) => {
        done(err);
      });

      connection.execSqlBatch(request);
    });

    it('should handle validation errors during streaming bulk loads', (done) => {
      const bulkLoad = connection.newBulkLoad('#stream_test', completeBulkLoad);
      bulkLoad.addColumn('value', TYPES.Date, { nullable: false });

      const rowStream = bulkLoad.getRowStream();
      connection.execBulkLoad(bulkLoad);

      const rowSource = Readable.from([
        ['invalid date']
      ]);

      pipeline(rowSource, rowStream, (err) => {
        assert.instanceOf(err, TypeError);
        assert.strictEqual(/** @type {TypeError} */(err).message, 'Invalid date.');
      });

      /**
       * @param {Error | undefined | null} err
       * @param {undefined | number} rowCount
       */
      function completeBulkLoad(err, rowCount) {
        assert.instanceOf(err, TypeError);
        assert.strictEqual(/** @type {TypeError} */(err).message, 'Invalid date.');

        done();
      }
    });

    it('should allow reusing the connection after validation errors during streaming bulk loads', (done) => {
      const bulkLoad = connection.newBulkLoad('#stream_test', completeBulkLoad);
      bulkLoad.addColumn('value', TYPES.Date, { nullable: false });

      const rowStream = bulkLoad.getRowStream();
      connection.execBulkLoad(bulkLoad);

      const rowSource = Readable.from([ ['invalid date'] ]);

      pipeline(rowSource, rowStream, (err) => {
        assert.instanceOf(err, TypeError);
        assert.strictEqual(/** @type {TypeError} */(err).message, 'Invalid date.');
      });

      /**
       * @param {Error | undefined | null} err
       * @param {undefined | number} rowCount
       */
      function completeBulkLoad(err, rowCount) {
        assert.instanceOf(err, TypeError);
        assert.strictEqual(/** @type {TypeError} */(err).message, 'Invalid date.');

        assert.strictEqual(rowCount, 0);

        /**
         * @type {unknown[]}
         */
        const rows = [];
        const request = new Request('SELECT 1', (err) => {
          assert.ifError(err);

          assert.deepEqual([1], rows);

          done();
        });

        request.on('row', (row) => {
          rows.push(row[0].value);
        });

        connection.execSql(request);
      }
    });
  });
});
