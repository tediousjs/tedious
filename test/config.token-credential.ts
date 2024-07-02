import { type ConnectionConfiguration } from '../src/connection';
import { UsernamePasswordCredential } from '@azure/identity';

const tokenCredential = new UsernamePasswordCredential(
  process.env.AZURE_AD_SP_TENANT_ID as string,
  process.env.AZURE_AD_SP_CLIENT_ID as string,
  process.env.AZURE_AD_USERNAME as string,
  process.env.AZURE_AD_PASSWORD as string
);

export default {
  'server': process.env.AZURE_SERVER,
  'authentication': {
    'type': 'token-credential',
    'options': {
      'credential': tokenCredential
    }
  },
  'options': {
    'port': 1433,
    'database': 'tedious'
  }
} as ConnectionConfiguration;
