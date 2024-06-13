// Configuration to use for integration tests.
import { type ConnectionConfiguration } from '../src/connection';
import { readFileSync } from 'fs';

export default {
  'server': 'mssql',
  'authentication': {
    'type': 'default',
    'options': {
      'userName': 'sa',
      'password': 'yourStrong(!)Password'
    }
  },
  'options': {
    'port': 1433,
    'database': 'master',
    'encrypt': true,
    'cryptoCredentialsDetails': {
      ca: readFileSync('./fixtures/mssql.crt')
    }
  }
} as ConnectionConfiguration;
