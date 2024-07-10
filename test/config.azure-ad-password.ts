import { type ConnectionConfiguration } from '../src/connection';

export default {
  'server': process.env.AZURE_SERVER,
  'authentication': {
    'type': 'azure-active-directory-password',
    'options': {
      'clientId': process.env.AZURE_AD_SP_CLIENT_ID,
      'tenantId': process.env.AZURE_AD_SP_TENANT_ID,
      'userName': process.env.AZURE_AD_USERNAME,
      'password': process.env.AZURE_AD_PASSWORD
    }
  },
  'options': {
    'port': 1433,
    'database': 'tedious'
  }
} as ConnectionConfiguration;
