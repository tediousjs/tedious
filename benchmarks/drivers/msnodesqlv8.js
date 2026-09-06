'use strict';

const sql = require('msnodesqlv8');

const { toPositionalParams } = require('./index');

const TYPE_MAP = {
  int: sql.Int,
  bigint: sql.BigInt,
  varchar: sql.VarChar,
  nvarchar: sql.NVarChar,
  varbinary: sql.VarBinary,
  uniqueidentifier: sql.UniqueIdentifier
};

function mapValue(param) {
  const mapped = TYPE_MAP[param.type];
  if (!mapped) {
    throw new Error(`Unsupported parameter type "${param.type}"`);
  }

  return mapped(param.value);
}

/**
 * Builds an ODBC connection string from the shared `tedious` style
 * configuration. Can be overridden entirely via the
 * `MSNODESQLV8_CONNECTION_STRING` environment variable; the ODBC driver name
 * can be changed via `ODBC_DRIVER` (defaults to "ODBC Driver 18 for SQL Server").
 */
function buildConnectionString(config) {
  if (process.env.MSNODESQLV8_CONNECTION_STRING) {
    return process.env.MSNODESQLV8_CONNECTION_STRING;
  }

  const options = config.options || {};
  const auth = (config.authentication && config.authentication.options) || {};

  let server = config.server;
  if (options.instanceName) {
    server += `\\${options.instanceName}`;
  } else if (options.port) {
    server += `,${options.port}`;
  }

  const parts = [
    `Driver={${process.env.ODBC_DRIVER || 'ODBC Driver 18 for SQL Server'}}`,
    `Server=${server}`,
    `Database=${options.database || 'master'}`
  ];

  if (auth.userName !== undefined) {
    parts.push(`UID=${auth.userName}`, `PWD=${auth.password}`);
  } else {
    parts.push('Trusted_Connection=yes');
  }

  parts.push(`Encrypt=${options.encrypt === false ? 'no' : 'yes'}`);
  if (options.trustServerCertificate) {
    parts.push('TrustServerCertificate=yes');
  }

  return parts.join(';');
}

/**
 * The `query` callback is invoked once per result set as
 * `(err, rows, more)`, with `more === true` for all but the last one. Wrap it
 * so the benchmark callback is only invoked once, with the rows of the last
 * result set.
 */
function once(callback) {
  let done = false;

  return (err, rows, more) => {
    if (done) {
      return;
    }

    if (err) {
      done = true;
      return callback(err);
    }

    if (more) {
      return;
    }

    done = true;
    callback(null, rows);
  };
}

/**
 * Same as `once`, but for `callproc`, whose callback is invoked as
 * `(err, rows, outputParams, more)`.
 */
function onceProcedure(callback) {
  const wrapped = once(callback);

  return (err, rows, outputParams, more) => {
    wrapped(err, rows, more);
  };
}

class MsNodeSqlV8Connection {
  constructor(connection) {
    this.connection = connection;
    this.userTypeTables = new Map();
    this.bulkTables = new Map();
  }

  execute(text, params, callback) {
    const { text: positionalSql, ordered } = toPositionalParams(text, params);

    this.connection.query(positionalSql, ordered.map(mapValue), once(callback));
  }

  batch(text, callback) {
    this.connection.query(text, once((err) => {
      callback(err || null);
    }));
  }

  callProcedure(name, params, callback) {
    this._mapProcedureParams(params, (err, mapped) => {
      if (err) {
        return callback(err);
      }

      this.connection.callproc(name, mapped, onceProcedure(callback));
    });
  }

  _mapProcedureParams(params, callback) {
    const mapped = new Array(params.length);

    (function next(i) {
      if (i === params.length) {
        return callback(null, mapped);
      }

      const param = params[i];

      if (param.type !== 'tvp') {
        mapped[i] = mapValue(param);
        return next(i + 1);
      }

      this._getUserTypeTable(param.typeName, (err, table) => {
        if (err) {
          return callback(err);
        }

        table.rows.length = 0;
        for (const row of param.rows) {
          table.rows.push(row);
        }

        mapped[i] = sql.TvpFromTable(table);
        next(i + 1);
      });
    }).call(this, 0);
  }

  _getUserTypeTable(typeName, callback) {
    // Looking up the user type's metadata requires a round trip to the server,
    // so cache the resulting table object per connection (the driver's own
    // table manager caches regular tables the same way).
    const cached = this.userTypeTables.get(typeName);
    if (cached) {
      return callback(null, cached);
    }

    this.connection.getUserTypeTable(typeName, (err, table) => {
      if (err) {
        return callback(err);
      }

      this.userTypeTables.set(typeName, table);
      callback(null, table);
    });
  }

  bulkLoad(table, columns, rows, callback) {
    this._getBulkTable(table, (err, bulkTable) => {
      if (err) {
        return callback(err);
      }

      bulkTable.insertRows(rows, (err) => {
        callback(err || null);
      });
    });
  }

  _getBulkTable(table, callback) {
    const cached = this.bulkTables.get(table);
    if (cached) {
      return callback(null, cached);
    }

    this.connection.tableMgr().getTable(table, (err, bulkTable) => {
      if (err) {
        return callback(err);
      }

      if (!bulkTable || typeof bulkTable.insertRows !== 'function') {
        return callback(new Error(`msnodesqlv8 could not resolve metadata for table "${table}"`));
      }

      this.bulkTables.set(table, bulkTable);
      callback(null, bulkTable);
    });
  }

  close(callback) {
    this.connection.close((err) => {
      callback(err || null);
    });
  }
}

function connect(config, callback) {
  sql.open(buildConnectionString(config), (err, connection) => {
    if (err) {
      return callback(err);
    }

    callback(null, new MsNodeSqlV8Connection(connection));
  });
}

module.exports = { name: 'msnodesqlv8', connect, buildConnectionString };
