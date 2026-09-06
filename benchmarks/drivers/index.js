'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DRIVERS = ['tedious', 'msnodesqlv8'];

/**
 * Loads the shared connection configuration from `~/.tedious/test-connection.json`.
 *
 * The file has the same shape as the one used by the integration tests, e.g.:
 *
 *   {
 *     "config": {
 *       "server": "localhost",
 *       "authentication": { "type": "default", "options": { "userName": "sa", "password": "..." } },
 *       "options": { "port": 1433, "database": "master", "trustServerCertificate": true }
 *     }
 *   }
 */
function loadConfig() {
  const file = path.join(os.homedir(), '.tedious', 'test-connection.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')).config;
}

/**
 * Returns a driver adapter by name. Every adapter exposes the same minimal,
 * callback based API so that the benchmarks in `compare/` can be written once
 * and executed against every driver:
 *
 *   driver.connect(config, (err, connection) => { ... })
 *
 *   connection.execute(sql, params, (err, rows) => { ... })
 *     Executes a parameterised SQL statement. `sql` uses `@name` placeholders,
 *     `params` is an array of `{ name, type, value, length? }`. All rows of the
 *     result set are collected and passed to the callback.
 *
 *   connection.batch(sql, (err) => { ... })
 *     Executes a (possibly multi-statement) SQL batch without parameters.
 *
 *   connection.callProcedure(name, params, (err, rows) => { ... })
 *     Calls a stored procedure via RPC. Parameters use the same shape as for
 *     `execute`; a table-valued parameter has `type: 'tvp'` and additionally
 *     carries `typeName`, `columns` (`[{ name, type, length? }]`) and `rows`
 *     (array of arrays).
 *
 *   connection.bulkLoad(table, columns, rows, (err) => { ... })
 *     Inserts `rows` (array of objects keyed by column name) into `table` using
 *     the driver's fastest bulk insert mechanism. `columns` is an array of
 *     `{ name, type, nullable, length? }`.
 *
 *   connection.close((err) => { ... })
 *
 * Supported `type` values: 'int', 'bigint', 'varchar', 'nvarchar',
 * 'varbinary', 'uniqueidentifier', 'tvp'.
 */
function createDriver(name) {
  if (!DRIVERS.includes(name)) {
    throw new Error(`Unknown driver "${name}". Supported drivers: ${DRIVERS.join(', ')}`);
  }

  return require(`./${name}`);
}

/**
 * Rewrites `@name` placeholders in `sql` to positional `?` placeholders and
 * returns the parameters in the order in which they occur in the statement.
 * Used by drivers that only support positional parameters.
 */
function toPositionalParams(sql, params) {
  const byName = new Map(params.map((p) => [p.name, p]));
  const ordered = [];

  const text = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => {
    const param = byName.get(name);
    if (!param) {
      // Not one of ours (e.g. `@@VERSION` or a T-SQL variable) - leave as is.
      return match;
    }

    ordered.push(param);
    return '?';
  });

  return { text, ordered };
}

module.exports = { DRIVERS, loadConfig, createDriver, toPositionalParams };

/**
 * Convenience helper: connects using the driver `name` and the shared
 * configuration. Errors are fatal, matching the style of the other benchmarks.
 */
function connect(name, callback) {
  createDriver(name).connect(loadConfig(), (err, connection) => {
    if (err) {
      throw err;
    }

    callback(connection);
  });
}

module.exports.connect = connect;
