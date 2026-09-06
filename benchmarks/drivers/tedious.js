'use strict';

const { Connection, Request, TYPES } = require('tedious');

const TYPE_MAP = {
  int: TYPES.Int,
  bigint: TYPES.BigInt,
  varchar: TYPES.VarChar,
  nvarchar: TYPES.NVarChar,
  varbinary: TYPES.VarBinary,
  uniqueidentifier: TYPES.UniqueIdentifier
};

function mapType(type) {
  const mapped = TYPE_MAP[type];
  if (!mapped) {
    throw new Error(`Unsupported parameter type "${type}"`);
  }
  return mapped;
}

function addParameter(request, param) {
  if (param.type === 'tvp') {
    request.addParameter(param.name, TYPES.TVP, {
      columns: param.columns.map((column) => ({
        name: column.name,
        type: mapType(column.type),
        length: column.length
      })),
      rows: param.rows
    });
    return;
  }

  const options = {};
  if (param.length !== undefined) {
    options.length = param.length;
  }

  request.addParameter(param.name, mapType(param.type), param.value, options);
}

function collectingRequest(sql, callback) {
  const rows = [];

  const request = new Request(sql, (err) => {
    if (err) {
      return callback(err);
    }

    callback(null, rows);
  });

  request.on('row', (columns) => {
    rows.push(columns);
  });

  return request;
}

class TediousConnection {
  constructor(connection) {
    this.connection = connection;
  }

  execute(sql, params, callback) {
    const request = collectingRequest(sql, callback);

    for (const param of params) {
      addParameter(request, param);
    }

    this.connection.execSql(request);
  }

  batch(sql, callback) {
    const request = new Request(sql, (err) => {
      callback(err || null);
    });

    this.connection.execSqlBatch(request);
  }

  callProcedure(name, params, callback) {
    const request = collectingRequest(name, callback);

    for (const param of params) {
      addParameter(request, param);
    }

    this.connection.callProcedure(request);
  }

  bulkLoad(table, columns, rows, callback) {
    const bulkLoad = this.connection.newBulkLoad(table, (err) => {
      callback(err || null);
    });

    for (const column of columns) {
      const options = { nullable: column.nullable };
      if (column.length !== undefined) {
        options.length = column.length;
      }

      bulkLoad.addColumn(column.name, mapType(column.type), options);
    }

    this.connection.execBulkLoad(bulkLoad, rows);
  }

  close(callback) {
    this.connection.once('end', () => {
      callback(null);
    });

    this.connection.close();
  }
}

function connect(config, callback) {
  const connection = new Connection(config);

  connection.connect((err) => {
    if (err) {
      return callback(err);
    }

    callback(null, new TediousConnection(connection));
  });
}

module.exports = { name: 'tedious', connect };
