# Tedious Changelog

## 1.x

### 1.0.0

- Start of semantic versioning, and commitment to stable API until `v2.0.0`
- No changes from version `0.3.0`.

## 0.x

### 0.3.0

- Added support for default connection isolation level
- Added support for returning camel cased columns
- Added support for building lib on Windows
- Fixed issue with IEEE 754 rounding errors
- Minor fixes

### 0.2.0

- Added support for TDS 7.4
- Added request cancelation
- Added support for UDT, TVP, Time, Date, DateTime2 and DateTimeOffset data types
- Added option to choose whether to pass/receive times in UTC or local time (`useUTC`)
- Binary, VarBinary, Image, Numeric, Decimal, SmallMoney and Money are now supported as input parameters
- Binary, VarBinary and Image types are now returned as Buffer (was Array)
- Connection errors are now correctly propagated to `connect` event
- Better support for numeric column names and columns with same name
- Errors are now instanceof Error / ConnectionError / RequestError (was plain text)
- Transaction isolationLevel default is now `READ_COMMITED` (was `READ_UNCOMMITED`)
- Fixed issue when zero value was casted as null when using BigInt as input parameter
- Fixed issue when dates before 1900/01/01 in input parameters resulted in "Out of bounds" error
- Fixed negative return values
- Fixed compatibility with TDS 7.1 (SQL Server 2000)
- Minor fixes

#### Upgrade from 0.1.5 to 0.2

- Time values are now passed/received in UTC instead of local time. You can disable this by `options.useUTC = false`.
- There was a change in default transaction isolationLevel from `READ_UNCOMMITED` to `READ_COMMITED`. You can disable this by `options.isolationLevel = require('tedious').ISOLATION_LEVEL.READ_UNCOMMITTED`.
- Binary values are now returned in Buffers.
- All error values are no longer strings, but instances of Error.
- Results (rows and column metadata) are now simple arrays. You can change this to key-value collections by `options.useColumnNames = true`.