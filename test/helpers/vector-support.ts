import { assert } from 'chai';

import type Connection from '../../src/connection';
import Request from '../../src/request';

/**
 * Whether the server has the `vector` data type: SQL Server 2025 (17.x) or
 * later, or Azure SQL Database.
 */
export function serverHasVectorType(connection: Connection): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let result = false;
    const request = new Request(`
      SELECT CAST(SERVERPROPERTY('ProductMajorVersion') AS int), CAST(SERVERPROPERTY('EngineEdition') AS int)
    `, (err) => (err ? reject(err) : resolve(result)));
    request.on('row', ([majorVersion, engineEdition]) => {
      // Azure SQL Database reports version 12.
      result = engineEdition.value === 5 || (engineEdition.value !== 8 && majorVersion.value >= 17);
    });
    connection.execSqlBatch(request);
  });
}

/**
 * Skips the current test unless native vector support was negotiated on
 * `connection`, and fails it if the client requested support and the server
 * supports vectors: a broken negotiation must not turn the tests pending.
 */
export async function requireVectorSupport(context: Mocha.Context, connection: Connection) {
  if (connection.vectorSupportVersion >= 1) {
    return;
  }

  if (connection.loginVectorSupportVersion > 0 && await serverHasVectorType(connection)) {
    assert.fail('Vector support was not negotiated, although the server and TDS version support it');
  }

  context.skip();
}
