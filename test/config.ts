// Configuration to use for integration tests.
import { type ConnectionConfiguration } from '../src/connection';

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
    'trustServerCertificate': true
  }
} as ConnectionConfiguration;
