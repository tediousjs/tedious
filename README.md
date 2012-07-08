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
Current version: v0.0.6

Coming soon
-----------
Although subject to change, this is the rough plan for the next few versions.


### v0.0.7 ###
- some support for TDS 7.1
- transaction management

### v0.0.8 ###
- support for more data types for parameters
- support for varchar(max), nvarchar(max) and varbinary(max) as streams

### v0.0.9 ###
- secure connections

### unplanned ###
- decoding of column metadata flags
- full decoding of collation data
- ability to cancel a request

Documentation
-------------
More documentation is available at [pekim.github.com/tedious/](http://pekim.github.com/tedious/)

Discussion
----------
Google Group - http://groups.google.com/group/node-tedious

Licence
-------
(The MIT License)

Copyright (c) 2010-2012 Mike D Pilsbury

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
