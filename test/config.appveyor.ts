import type { ConnectionConfiguration } from '../src/connection';

export default {
  'server': 'localhost',
  'authentication': {
    'type': 'ntlm',
    'options': {
      'userName': process.env.NTLM_USERNAME,
      'password': process.env.NTLM_PASSWORD,
      'domain': process.env.NTLM_DOMAIN
    }
  },
  'options': {
    'instanceName': 'SQL2017',
    'database': 'master',
    'trustServerCertificate': true
  }
} as ConnectionConfiguration;
