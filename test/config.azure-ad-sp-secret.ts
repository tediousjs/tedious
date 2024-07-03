import { type ConnectionConfiguration } from '../src/connection';

export default {
  'server': process.env.AZURE_SERVER,
  'authentication': {
    'type': 'azure-active-directory-service-principal-secret',
    'options': {
      'clientId': process.env.AZURE_AD_SP_CLIENT_ID,
      'tenantId': process.env.AZURE_AD_SP_TENANT_ID,
      'clientSecret': process.env.AZURE_AD_SP_CLIENT_SECRET
    }
  },
  'options': {
    'port': 1433,
    'database': 'tedious'
  }
} as ConnectionConfiguration;
