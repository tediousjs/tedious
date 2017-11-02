// TODO: expand to add KEEP_IDENTITY, USE_INTERNAL_TRANSACTIONS while adding bulk load support for tables
/**
 * Enum for BulkLoad options
 * @readonly
 */
module.exports.BULK_LOAD_OPTIONS = {
  /** Hounours constraints during bulk load, it is disabled by deault */
  CHECK_CONSTRAINTS: 'CHECK_CONSTRAINTS',
  /** Hounours insert triggers during bulk load, it is disabled by deault */
  FIRE_TRIGGERS: 'FIRE_TRIGGERS',
  /** Hounours null value passed, ignores the default values set on table */
  KEEP_NULLS: 'KEEP_NULLS',
  /** Places a bulk update(BU) lock on table while performing bulk load. Uses row locks by default. */
  TABLE_LOCK: 'TABLOCK',
};
