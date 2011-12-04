Tedious (node implementation of TDS)
====================================
[![Build Status](https://secure.travis-ci.org/pekim/tedious.png)](http://travis-ci.org/pekim/tedious)

Tedious is an implementation of the [TDS protocol](http://msdn.microsoft.com/en-us/library/dd304523.aspx),
which is used to interact with instances of Microsoft's SQL Server.

Name
----
_Tedious_ is simply derived from a fast, slightly garbled, pronunciation of the letters T, D and S. 

Status
------
Tedious is just about useable for simple statements.

- Session establishment and authentication work.
- Sending SQL statements (in a `SQL_BATCH` packet) works for some simple statements.
 - Many simple data types are supported.
 - An event for column metadata in the response is emitted.
 - Events for each row in the response are emitted.

There's still a lot that needs doing.

- Support for more data types.
- The API needs to change to support statement execution with a Statement class.
- Decoding of column metadata flags.
- Decoding of collation data.
- Ability to cancel a request.
- Support for transactions.
- Better support for large values (for example integers over 53 bits).

Documentation
-------------
More documentation is available at [pekim.github.com/tedious/](http://pekim.github.com/tedious/)

Licence
-------
(The MIT License)

Copyright (c) 2010-2011 Mike D Pilsbury

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
