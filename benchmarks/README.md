# Tedious Benchmarks

This folder contains a collection of benchmarks for `tedious`.

Running all existing benchmarks is easy, just execute the following from
inside the `tedious` root folder:

```sh
node benchmarks
```

**NOTE:** The benchmarks try to load `tedious` code from `lib`, so make sure
you run `npm run prepublish` first.

This will serially execute every available benchmark test in a
seperate Node.js process. Running each benchmark in a separate process
ensures that each benchmark is run with a clean slate.

You can also execute a specific benchmarks:

```sh
node benchmarks/<type>/<benchmark-name>
```

The benchmarks are executed by using the `benchmark` module. Unfortunately,
this module can add a bit of useless noise when trying to collect profiling
information. To reduce this noise, benchmarks can be run in a special "profile"
mode. This will execute the benchmark's code without making use of `benchmark`
library and with a fixed number of iterations.

```sh
node benchmarks/<type>/<benchmark-name> --profile
```
