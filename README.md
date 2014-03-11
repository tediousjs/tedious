# Tedious (node implementation of TDS)
[![Dependency Status](https://david-dm.org/pekim/tedious.png)](https://david-dm.org/pekim/tedious) [![NPM version](https://badge.fury.io/js/tedious.png)](http://badge.fury.io/js/mssql) [![Build Status](https://secure.travis-ci.org/pekim/tedious.png)](http://travis-ci.org/pekim/tedious)

Tedious is an implementation of the [TDS protocol](http://msdn.microsoft.com/en-us/library/dd304523.aspx),
which is used to interact with instances of Microsoft's SQL Server. It is intended to be a fairly slim implementation of the protocol, with not too much additional functionality.

### Supported TDS versions

- TDS 7.4 (SQL Server 2012/2014)
- TDS 7.3.A (SQL Server 2008 R2)
- TDS 7.3.B (SQL Server 2008)
- TDS 7.2 (SQL Server 2005)
- TDS 7.1 (SQL Server 2000)

<a name="status" />
## Status
Current version: 0.1.5

### Coming soon in 0.2.0

- Added support for TDS 7.4
- Added support for UDT, Time, Date, DateTime2 and DateTimeOffset data types
- Added option to choose whether to pass/receive times in UTC or local time (`useUTC`)
- Binary, VarBinary and Image are now supported as input parameters
- Binary, VarBinary and Image types are now returned as Buffer (was Array)
- Connection errors are now correctly propagated to `connect` event.
- Errors are now instanceof Error / ConnectionError / RequestError (was plain text)
- Transaction isolationLevel default is now `READ_COMMITED` (was `READ_UNCOMMITED`)
- Fixed issue when zero value was casted as null when using BigInt as input parameter
- Fixed issue when dates before 1900/01/01 in input parameters resulted in "Out of bounds" error
- Fixed compatibility with TDS 7.1 (SQL Server 2000)
- Minor fixes

### Upgrade from 0.1.5 to 0.2.0

- Time values are now passed/received in UTC instead of local time. You can disable this by `options.useUTC = false`.
- There was a change in default transaction isolationLevel from `READ_UNCOMMITED` to `READ_COMMITED`. You can disable this by `options.isolationLevel = require('tedious').ISOLATION_LEVEL.READ_UNCOMMITTED`.
- Binary values are now returned in Buffers.
- All error values are no longer strings, but instances of Error.

<a name="documentation" />
## Documentation
More documentation is available at [pekim.github.io/tedious/](http://pekim.github.io/tedious/)

<a name="discussion" />
## Discussion
Google Group - http://groups.google.com/group/node-tedious

<a name="name" />
## Name
_Tedious_ is simply derived from a fast, slightly garbled, pronunciation of the letters T, D and S. 

<a name="license" />
## Licence

Copyright (c) 2010-2014 Mike D Pilsbury

The MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
