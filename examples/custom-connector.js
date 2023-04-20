var net = require('net');
var Connection = require('../lib/tedious').Connection;

var config = {
  server: '192.168.1.212',
  authentication: {
    type: 'default',
    options: {
      userName: 'test',
      password: 'test'
    }
  },
  options: {
    connector: async () => net.connect({
      host: '192.168.1.212',
      port: 1433,
    })
  }
};

const connection = new Connection(config);

connection.connect((err) => {
  if (err) {
    console.log('Connection Failed');
    throw err;
  }

  console.log('Custom connection Succeeded');
});
