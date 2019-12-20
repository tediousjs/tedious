import { SQLServerStatementColumnEncryptionSetting } from "./types";

export const shouldHonorAE = (stmtColumnEncryptionSetting: SQLServerStatementColumnEncryptionSetting, columnEncryptionSetting: boolean): boolean => {
  switch (stmtColumnEncryptionSetting) {
    case SQLServerStatementColumnEncryptionSetting.Disabled:
    case SQLServerStatementColumnEncryptionSetting.ResultSetOnly:
        return false;
    case SQLServerStatementColumnEncryptionSetting.Enabled:
        return true;
    default:
      return columnEncryptionSetting;
  }
};
