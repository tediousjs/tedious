Tedious (node implementation of TDS)
====================================

Tedious is an implementation of the [TDS protocol](http://msdn.microsoft.com/en-us/library/dd304523.aspx),
which is used to interact with instances of Microsoft's SQL Server.

Name
----
_Tedious_ is simply derived from a fast, slightly garbled, pronunciation of the letters T, D and S. 

Status
------
Tedious is not yet useable.

PreLogin and Login7 packets and their responses are broadly implemented.
Authentication works.

A SQL statement request can be sent.
The response token for column metadata can be parsed (for a few simple datatypes)
Work is in progress to parse the row token (again for a few datatypes.
Once this is more or less working, tedious might be useable, after a fashion, for very simple use cases.

Licence
-------
(The MIT License)

Copyright (c) 2010-2011 Mike D Pilsbury

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
