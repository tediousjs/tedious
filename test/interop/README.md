# Always Encrypted compatibility checks

Applications written with different drivers share encrypted columns. These
checks make sure that tedious and Microsoft's drivers understand what the
other one stored:

| | Driver | Column master key |
| --- | --- | --- |
| `jdbc` | [Microsoft JDBC Driver for SQL Server](https://github.com/microsoft/mssql-jdbc), see `jdbc/pom.xml` for its version | its `MSSQL_JAVA_KEYSTORE` provider, with a PKCS #12 key store |
| `sqlclient` | [Microsoft.Data.SqlClient](https://github.com/dotnet/SqlClient), see `sqlclient/Interop.csproj` for its version | a provider of the test that reads a PEM file: the ones SqlClient brings along need Windows or Azure |

They are run by the `Driver compatibility` workflow, and are not part of
`npm test`.

## What is checked

For each column of a scenario (`specs/*.tsv`), a table has a deterministically
encrypted and a randomized column. Both drivers write each value of the spec,
and a `NULL`, to both. The column encryption key of the deterministic columns
is encrypted by tedious, the one of the randomized columns by the other driver
(by tedious as well for SqlClient). Then:

| Check | Made by | |
| --- | --- | --- |
| `write` | both | The driver stores the value. |
| `read` | both | The driver reads the value that the other driver stored. |
| `ciphertext` | tedious | The deterministically encrypted cells of both drivers are the same, byte for byte. |
| `lookup` | both | `WHERE column = @value` finds the rows of both drivers. |

Scenarios are databases of different collations, as the code page of the
database is what `varchar` parameters are sent in:

| Scenario | Database collation | |
| --- | --- | --- |
| `default` | `SQL_Latin1_General_CP1_CI_AS` | Every data type that can be encrypted. |
| `cyrillic` | `Cyrillic_General_CI_AS` | Character data in a single-byte code page other than 1252. |
| `japanese` | `Japanese_CI_AS` | Character data in a multi-byte code page. |
| `utf8` | `Latin1_General_100_CI_AS_SC_UTF8` | Character data in UTF-8. |

The JDBC driver encodes `varchar` values with the default charset of the JVM,
so the JVM is run with the charset of the database.

## Known differences

The drivers do not agree on everything. Checks that are known to fail are
listed in `jdbc/known-differences.tsv` and `sqlclient/known-differences.tsv`,
together with the reason.

A run fails if a check fails that is not listed there. It also fails if a
listed check passes: either the other driver changed, or tedious did, and the
list is to be updated on purpose.

Dependabot proposes updates of the drivers. When the checks of such an update
fail, the list of the driver is to be updated in the same pull request.

A column that one of the drivers is not able to write at all names the drivers
that do write it in the `written by` field of the spec: tedious sends a
`datetimeoffset` in UTC, so it does not write the column that holds another
offset. It does read it.

SqlClient is run with the `Switch.Microsoft.Data.SqlClient.LegacyVarTimeZeroScaleBehaviour`
switch turned off. Otherwise it sends a `time`, `datetime2` or `datetimeoffset`
parameter of scale 0 with scale 7, which the server does not accept for an
encrypted column of scale 0.

## Running the checks

They need a SQL Server that `test/config.ts` connects to, OpenSSL, and

- for `jdbc`: a JDK (17 or later) and Maven,
- for `sqlclient`: the .NET SDK (8 or later).

```sh
docker compose -f test/docker-compose.linux.yml up --detach
cp test/config.ci.ts test/config.ts

test/interop/run.sh jdbc
test/interop/run.sh sqlclient

# Some of the scenarios only
test/interop/run.sh jdbc japanese utf8
```

The other driver connects to `localhost:1433` as `sa`, with the password of
`test/config.ci.ts`. Set `INTEROP_HOST`, `INTEROP_PORT`, `INTEROP_USER` and
`INTEROP_PASSWORD` for another server. The databases `tedious_interop_*` are
created, and dropped again.

Keys, builds and the results of each check (`results.tsv`) are found in
`test/interop/.work/`.

## Spec files

A line of a spec file is a column, its fields are separated by tabs:

| Field | |
| --- | --- |
| name | The columns are named `<name>_d` and `<name>_r`. |
| type | The SQL type of the columns. |
| kind | How the drivers send and compare the values, see `parameter` in `tedious.ts`. |
| parameters | The length, precision and scale, or scale and offset of the kind, or `-`. |
| collation | The collation of the columns, or `-`. |
| written by | `all`, or the drivers that write the column. |
| values | One per field. `given=>stored` where a column does not hold what it was given, `empty:` is the empty string, `repeat:text:count` a repeated text. Binary values are in hex, dates and times in UTC. |
