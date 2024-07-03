// Configuration to use for integration tests.
import { type ConnectionConfiguration } from '../src/connection';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export default {
  'server': 'localhost',
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
      ca: readFileSync(resolve(__dirname, './fixtures/mssql.crt'))
    }
  }
} as ConnectionConfiguration;
