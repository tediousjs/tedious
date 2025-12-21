// This code is based on the `mssql-jdbc` library published under the conditions of MIT license.
// Copyright (c) 2019 Microsoft Corporation

import { SQLServerStatementColumnEncryptionSetting } from './types';

export const shouldHonorAE = (stmtColumnEncryptionSetting: SQLServerStatementColumnEncryptionSetting, alwaysEncrypted: boolean): boolean => {
  switch (stmtColumnEncryptionSetting) {
    case SQLServerStatementColumnEncryptionSetting.Disabled:
    case SQLServerStatementColumnEncryptionSetting.ResultSetOnly:
      return false;
    case SQLServerStatementColumnEncryptionSetting.Enabled:
      return true;
    default:
      return alwaysEncrypted;
  }
};
