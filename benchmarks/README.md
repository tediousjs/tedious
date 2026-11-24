# Tedious Benchmarks

This folder contains a collection of benchmarks for `tedious`.

Running an existing benchmark is easy, simply execute the benchmark file with `node`:

```sh
node benchmarks/query/select-many-rows.js
```

**NOTE:** Before running benchmarks, run `npm run build` from the repository root
and `npm install` inside `benchmarks/`. This builds the driver in `lib` and installs
the benchmarks' local `tedious` dependency.
