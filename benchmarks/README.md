# Tedious Benchmarks

This folder contains a collection of benchmarks for `tedious`.

Running an existing benchmark is easy, simply execute the benchmark file with `node`:

```sh
node benchmarks/query/select-many-rows.js
```

**NOTE:** The benchmarks try to load `tedious` code from `lib`, so make sure
you run `npm run prepublish` first.

All benchmarks read their connection configuration from
`~/.tedious/test-connection.json`, using the same format as the integration
tests:

```json
{
  "config": {
    "server": "localhost",
    "authentication": {
      "type": "default",
      "options": { "userName": "sa", "password": "yourStrong(!)Password" }
    },
    "options": {
      "port": 1433,
      "database": "master",
      "trustServerCertificate": true
    }
  }
}
```

Every benchmark accepts `key=value` arguments that override the configuration
matrix defined in the file, e.g. `node benchmarks/query/select-many-rows.js n=10 size=100`.

## Comparing `tedious` against `msnodesqlv8`

The benchmarks in `compare/` run the same workloads against `tedious` and
[`msnodesqlv8`](https://www.npmjs.com/package/msnodesqlv8) (a native ODBC based
driver) and report the throughput of each driver.

### Setup

`msnodesqlv8` is a native module that requires a Microsoft ODBC driver on the host:

- Linux / macOS: install unixODBC and the
  [Microsoft ODBC Driver 18 for SQL Server](https://learn.microsoft.com/sql/connect/odbc/linux-mac/installing-the-microsoft-odbc-driver-for-sql-server)
- Windows: install the ODBC Driver 18 for SQL Server MSI

Then install the benchmark dependencies (including `msnodesqlv8`):

```sh
npm run prepublish
cd benchmarks && npm install
```

The ODBC connection string is derived from `~/.tedious/test-connection.json`.
Set `ODBC_DRIVER` to use a different ODBC driver name (default:
`ODBC Driver 18 for SQL Server`), or `MSNODESQLV8_CONNECTION_STRING` to provide
a complete connection string yourself.

### Running

Run the whole suite and print a comparison table:

```sh
node benchmarks/compare/run.js
```

Individual benchmarks can be selected by name, and `key=value` arguments are
forwarded to the benchmarks:

```sh
# only run two benchmarks, with a smaller matrix
node benchmarks/compare/run.js select-many-rows bulk-load n=10 size=1000

# only run a single driver
node benchmarks/compare/run.js driver=tedious
```

Each benchmark file can also be executed on its own, in which case it runs its
full matrix (including the `driver` dimension) and prints one line per
configuration:

```sh
node benchmarks/compare/select-many-rows.js driver=msnodesqlv8 n=100
```

### Benchmarks

| Benchmark          | Workload                                                                              |
| ------------------ | ------------------------------------------------------------------------------------- |
| `connection-open`  | Open and close a connection                                                           |
| `select-many-rows` | `SELECT` `size` rows with an `int`, `nvarchar(100)` and `nvarchar(max)` column        |
| `select-nvarchar`  | `SELECT` a single `nvarchar(max)` value of `size` characters                          |
| `select-varbinary` | `SELECT` a single `varbinary(max)` value of `size` bytes                              |
| `insert-varbinary` | Send a `varbinary` parameter of `size` bytes                                          |
| `call-tvp`         | Call a stored procedure with a 500 row table-valued parameter                         |
| `bulk-load`        | Bulk insert `size` rows into a single column table                                    |

### Caveats

- `msnodesqlv8` enables ODBC connection pooling for its process, so after the
  first connection has been opened, `connection-open` measures how fast a
  pooled connection can be checked out and returned. `tedious` performs a full
  TDS login on every iteration, and the login round trip dominates the result.
- `msnodesqlv8` needs table metadata to perform bulk inserts and cannot resolve
  it for temporary tables, so `bulk-load` uses a regular table in `tempdb`.
- The drivers are given comparable, but not identical, work: `tedious` is
  asked to collect all rows of a result set through its `row` event, while
  `msnodesqlv8` returns the rows of a result set from its `query` callback.
- The `drivers/` directory contains the thin adapters that map the shared
  benchmark API onto each driver. Add a new adapter there (and to `DRIVERS` in
  `drivers/index.js`) to include another driver in the comparison.
