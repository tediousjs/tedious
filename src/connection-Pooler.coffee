PoolModule = require('generic-pool')
Connection = require('./connection')

class ConnectionPooler

  constructor: (config) ->
    _this = this
    param =
      name: config.name
      create: (callback) ->
        connection = new Connection(config)
        connection.on('connect', (err) ->
          console.log('connected')
          if !err
            callback(null, connection)
            connection.on('reusable', () ->
              _this.pool.release(connection)
            )
        )
      destroy: (client) ->
        client.close()
      max: config.max
      idleTimeoutMillis : config.idleTimeoutMillis
    @pool = PoolModule.Pool(param);

  execSql: (request) ->
    @pool.acquire((err, connection) ->
      if(err)
        console.log(err)
      else
        connection.execSql(request)
    )

  execSqlBatch: (request) ->
    @pool.acquire((err, connection) ->
      if(err)
        console.log(err)
      else
        connection.execSqlBatch(request)
    )

  execute: (request, parameters) ->
    @pool.acquire((err, connection) ->
      if(err)
        console.log(err)
      else
        connection.execute(request, parameters)
    )

  prepare: (request) ->
    @pool.acquire((err, connection) ->
      if(err)
        console.log(err)
      else
        connection.prepare(request)
    )

  unprepare: (request) ->
    @pool.acquire((err, connection) ->
      if(err)
        console.log(err)
      else
        connection.unprepare(request)
    )

  callProcedure: (request) ->
    @pool.acquire((err, connection) ->
      if(err)
        console.log(err)
      else
        connection.callProcedure(request)
    )

  beginTransaction: (callback, name, isolationLevel) ->
    @pool.acquire((err, connection) ->
      if(err)
        console.log(err)
      else
        connection.beginTransaction(callback, name, isolationLevel)
    )

  commitTransaction: (callback) ->
    @pool.acquire((err, connection) ->
      if(err)
        console.log(err)
      else
        connection.commitTransaction(callback)
    )

  rollbackTransaction: (callback) ->
    @pool.acquire((err, connection) ->
      if(err)
        console.log(err)
      else
        connection.rollbackTransaction(callback)
    )  

module.exports = ConnectionPooler
