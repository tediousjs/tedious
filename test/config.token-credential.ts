import { type ConnectionConfiguration } from '../src/connection';
import { ClientSecretCredential } from '@azure/identity';

const tokenCredential = new ClientSecretCredential(
  process.env.AZURE_AD_SP_TENANT_ID as string,
  process.env.AZURE_AD_SP_CLIENT_ID as string,
  process.env.AZURE_AD_SP_CLIENT_SECRET as string
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
