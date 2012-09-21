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

  execute: (callback) ->
    @pool.acquire((err, connection) ->
      if(err)
        console.log(err)
      else
        callback(connection)
    )

module.exports = ConnectionPooler
