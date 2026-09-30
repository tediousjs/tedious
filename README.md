# Tedious (node implementation of TDS)
[![NPM version](https://badge.fury.io/js/tedious.svg)](http://badge.fury.io/js/tedious) [![Build Status](https://ci.appveyor.com/api/projects/status/ike3p58hljpyffrl?svg=true)](https://ci.appveyor.com/project/tediousjs/tedious) [![Code Coverage](https://codecov.io/gh/tediousjs/tedious/badge.svg)](https://codecov.io/gh/tediousjs/tedious)


Tedious is a pure-Javascript implementation of the [TDS protocol](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-tds/b46a581a-39de-4745-b076-ec4dbb7d13ec?redirectedfrom=MSDN),
which is used to interact with instances of Microsoft's SQL Server. It is intended to be a fairly slim implementation of the protocol, with not too much additional functionality.

See the [changelog](https://github.com/tediousjs/tedious/releases) for version history.

### Supported TDS versions

- TDS 7.4 (SQL Server 2012/2014/2016/2017/2019/2022)
- TDS 7.3.B (SQL Server 2008 R2)
- TDS 7.3.A (SQL Server 2008)
- TDS 7.2 (SQL Server 2005)
- TDS 7.1 (SQL Server 2000) - *deprecated, support will be removed in a future version*

## Installation

Node.js is a prerequisite for installing tedious. Once you have installed [Node.js](https://nodejs.org/), installing tedious is simple:

    npm install tedious

## Getting Started
- [Node.js SQL Server Guide](https://learn.microsoft.com/en-us/sql/connect/node-js/node-js-driver-for-sql-server)
- [Node.js + macOS](https://learn.microsoft.com/en-us/sql/connect/node-js/step-1-configure-development-environment-for-node-js-development#macos)
- [Node.js + Red Hat Enterprise Linux](https://learn.microsoft.com/en-us/sql/linux/install-upgrade/quickstart-install-red-hat)
- [Node.js + SUSE Linux Enterprise Server](https://learn.microsoft.com/en-us/sql/linux/install-upgrade/quickstart-install-suse)
- [Node.js + Ubuntu](https://learn.microsoft.com/en-us/sql/connect/node-js/step-1-configure-development-environment-for-node-js-development#ubuntu-linux)
- [Node.js + Windows](https://learn.microsoft.com/en-us/sql/connect/node-js/step-1-configure-development-environment-for-node-js-development#windows)

<a name="documentation"></a>
## Documentation
More documentation and code samples are available at [tediousjs.github.io/tedious/](http://tediousjs.github.io/tedious/)

<a name="name"></a>
## Name
_Tedious_ is simply derived from a fast, slightly garbled, pronunciation of the letters T, D and S.

<a name="contributing"></a>
## Contributing
We welcome contributions from the community. Feel free to checkout the code and submit pull requests.

## Security
Please report security vulnerabilities privately. See our [security policy](SECURITY.md) for reporting instructions.

<a name="license"></a>
## License

Copyright (c) 2010-2021 Mike D Pilsbury

The MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
