# Tedious (node implementation of TDS)
[![NPM version](https://badge.fury.io/js/tedious.svg)](http://badge.fury.io/js/tedious) [![Build Status](https://ci.appveyor.com/api/projects/status/ike3p58hljpyffrl?svg=true)](https://ci.appveyor.com/project/tediousjs/tedious) [![Code Coverage](https://codecov.io/gh/tediousjs/tedious/badge.svg)](https://codecov.io/gh/tediousjs/tedious)


Tedious is a pure-JavaScript implementation of the [TDS protocol](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-tds/),
which is used to interact with instances of Microsoft's SQL Server. It is intended to be a fairly slim implementation of the protocol, with not too much additional functionality.

### Supported TDS versions

- TDS 8.0 (SQL Server 2022 and later; requires `encrypt: 'strict'`)
- TDS 7.4 (SQL Server 2012/2014/2016/2017/2019/2022)
- TDS 7.3.B (SQL Server 2008 R2)
- TDS 7.3.A (SQL Server 2008)
- TDS 7.2 (SQL Server 2005)
- TDS 7.1 (SQL Server 2000) - deprecated

## Installation

Tedious requires [Node.js 22 or later](https://nodejs.org/). Install the package with:

```sh
npm install tedious
```

## Getting started

Platform-specific guides are available for:

- [macOS](https://www.microsoft.com/en-us/sql-server/developer-get-started/node/mac/)
- [Red Hat Enterprise Linux](https://www.microsoft.com/en-us/sql-server/developer-get-started/node/rhel/)
- [SUSE Linux Enterprise Server](https://www.microsoft.com/en-us/sql-server/developer-get-started/node/sles/)
- [Ubuntu](https://www.microsoft.com/en-us/sql-server/developer-get-started/node/ubuntu/)
- [Windows](https://www.microsoft.com/en-us/sql-server/developer-get-started/node/windows/)

Create a connection using your SQL Server host and credentials, then execute a
request. This example reads credentials from environment variables; set them
before running the script.

```js
const { Connection, Request } = require('tedious');

const connection = new Connection({
  server: process.env.DB_SERVER,
  authentication: {
    type: 'default',
    options: {
      userName: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    }
  },
  options: {
    database: process.env.DB_DATABASE,
    encrypt: true
  }
});

connection.connect((error) => {
  if (error) {
    console.error('Connection failed:', error);
    return;
  }

  const request = new Request('SELECT 1 AS value', (error) => {
    if (error) {
      console.error('Query failed:', error);
    }
    connection.close();
  });

  request.on('row', (columns) => {
    console.log(columns[0].value);
  });

  connection.execSql(request);
});
```

For SQL Server 2022 or later when using TDS 8.0, set both
`tdsVersion: '8_0'` and `encrypt: 'strict'`. Strict encryption requires a
valid server certificate; `trustServerCertificate` does not bypass certificate
validation in this mode. See the
[API documentation](https://tediousjs.github.io/tedious/) and
[examples](examples/) for more options and usage patterns.

<a name="documentation"></a>
## Documentation
More documentation and code samples are available at [tediousjs.github.io/tedious/](https://tediousjs.github.io/tedious/)

<a name="name"></a>
## Name
_Tedious_ is simply derived from a fast, slightly garbled, pronunciation of the letters T, D and S.

## Developer Survey

We'd like to learn more about how you use tedious:

<a href="https://aka.ms/mssqltedioussurvey"><img style="float: right;"  height="67" width="156" src="https://sqlchoice.blob.core.windows.net/sqlchoice/static/images/survey.png"></a>

<a name="contributing"></a>
## Contributing
We welcome contributions from the community. Feel free to check out the code and submit pull requests.

## Security
Please report security vulnerabilities privately. See our [security policy](SECURITY.md) for reporting instructions.

<a name="license"></a>
## License

Copyright (c) 2010-2021 Mike D Pilsbury

The MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
