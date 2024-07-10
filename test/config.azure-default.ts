import { type ConnectionConfiguration } from '../src/connection';

export default {
  'server': process.env.AZURE_SERVER,
  'authentication': {
    'type': 'default',
    'options': {
      'userName': process.env.AZURE_USERNAME,
      'password': process.env.AZURE_PASSWORD
    }
  },
  'options': {
    'port': 1433,
    'database': 'tedious'
  }
} as ConnectionConfiguration;
