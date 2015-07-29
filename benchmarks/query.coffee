fs = require "fs"

Benchmark = require("benchmark")
{Connection} = require "../src/tedious"

setup = (cb) ->
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

  connection = new Connection(config)
  connection.on "connect", ->
    cb(connection)

benchmarks = require("./benchmarks")

setup (connection) ->
  execute = (names, cb) ->
    return cb() unless names.length

    name = names.shift()

    memMax = memStart = process.memoryUsage().rss;

    benchmark = benchmarks[name]
    benchmark.setup connection, (err) ->
      if (err)
        console.log("Error in '#{name}' setup:")
        console.error(err)

      bench = new Benchmark name,
        defer: true
        fn: (deferred) ->
          benchmark.exec connection, (err) ->
            if (err)
              console.log("Error in '#{name}' execution:")
              console.error(err)

            memMax = Math.max(memMax, process.memoryUsage().rss);

            deferred.resolve()

      bench.on "complete", (event) ->
        console.log(String(event.target))
        console.log("Memory:", (memMax - memStart)/1024/1024)

        benchmark.teardown connection, (err) ->
          if (err)
            console.log("Error in '#{name}' teardown:")
            console.error(err)

          execute(names, cb)

      console.log "Benchmarking '#{name}'"
      bench.run "async": true

  execute Object.keys(benchmarks), ->
    connection.close()
    console.log("Done!")
