export enum SQLServerStatementColumnEncryptionSetting {
  /**
   * if "Column Encryption Setting=Enabled" in the connection string, use Enabled. Otherwise, maps to Disabled.
   */
  UseConnectionSetting,
  /**
   * Enables TCE for the command. Overrides the connection level setting for this command.
   */
  Enabled,
  /**
   * Parameters will not be encrypted, only the ResultSet will be decrypted. This is an optimization for queries that
   * do not pass any encrypted input parameters. Overrides the connection level setting for this command.
   */
  ResultSetOnly,
  /**
   * Disables TCE for the command.Overrides the connection level setting for this command.
   */
  Disabled,
}

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
}

// Fields in the first resultset of "sp_describe_parameter_encryption"
// We expect the server to return the fields in the resultset in the same order as mentioned below.
// If the server changes the below order, then transparent parameter encryption will break.
export enum DescribeParameterEncryptionResultSet1 {
  KeyOrdinal,
  DbId,
  KeyId,
  KeyVersion,
  KeyMdVersion,
  EncryptedKey,
  ProviderName,
  KeyPath,
  KeyEncryptionAlgorithm
}


// Fields in the second resultset of "sp_describe_parameter_encryption"
// We expect the server to return the fields in the resultset in the same order as mentioned below.
// If the server changes the below order, then transparent parameter encryption will break.
export enum DescribeParameterEncryptionResultSet2 {
  ParameterOrdinal,
  ParameterName,
  ColumnEncryptionAlgorithm,
  ColumnEncrytionType,
  ColumnEncryptionKeyOrdinal,
  NormalizationRuleVersion
}