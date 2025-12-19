# MS-TDS Specification Compliance Report for Tedious

**Specification Version:** MS-TDS v20251031 (October 31, 2025)
**Tedious Version:** Current main branch
**Report Date:** December 2024

---

## Executive Summary

After analyzing the MS-TDS specification and comparing it to the tedious implementation, I have identified several areas where the implementation deviates from the specification, has missing functionality, or contains potentially incorrect implementations.

**Key Findings:**
- 2 completely missing data types (JSON, Vector)
- 7 token types defined but not parsed
- 2 token types completely missing
- Multiple missing ENVCHANGE types
- Incomplete feature extension support
- Limited Always Encrypted support
- No session recovery/connection resiliency

---

## 1. MISSING DATA TYPES

### 1.1 JSON Type (JSONTYPE = 0xF4) - **MISSING**

**Spec Reference:** Section 2.2.5.4.3
**Location:** `src/data-type.ts`

The MS-TDS specification defines a `JSONTYPE` (0xF4) as a `LONGLEN_TYPE`, but tedious does not implement this type. This is a newer data type in SQL Server that should be supported.

### 1.2 Vector Type (VECTORTYPE = 0xF5) - **MISSING**

**Spec Reference:** Section 2.2.5.5.7
**Location:** `src/data-type.ts`

The specification defines a new `VECTORTYPE` (0xF5) for vector data (used for AI/ML embeddings). This includes:
- Layout Format byte
- Layout Version (must be 0x01)
- Number of Dimensions (2 bytes, little-endian)
- Dimension Type identifier
- Reserved bytes
- Stream of values

This entire type is not implemented in tedious.

### 1.3 Legacy Data Types - **INCOMPLETE**

**Spec Reference:** Section 2.2.5.4.3

The specification defines legacy character/binary types that tedious doesn't explicitly support:
- `CHARTYPE` (0x2F) - Char legacy support
- `VARCHARTYPE` (0x27) - VarChar legacy support
- `BINARYTYPE` (0x2D) - Binary legacy support
- `VARBINARYTYPE` (0x25) - VarBinary legacy support

**Location:** `src/data-type.ts:92-132`

Tedious uses the "Big" variants (BIGCHARTYPE, BIGVARCHARTYPE, etc.) but doesn't handle the legacy type IDs.

---

## 2. INCOMPLETE TOKEN IMPLEMENTATIONS

### 2.1 ALTMETADATA Token (0x88) - **PARSING MISSING**

**Spec Reference:** Section 2.2.7.1
**Location:** `src/token/token.ts:7`

The token constant is defined but there is no parser for ALTMETADATA. This token is used for compute clause results.

### 2.2 ALTROW Token (0xD3) - **PARSING MISSING**

**Spec Reference:** Section 2.2.7.2
**Location:** `src/token/token.ts:8`

Similarly, ALTROW is defined as a constant but no parser exists.

### 2.3 COLINFO Token (0xA5) - **PARSING MISSING**

**Spec Reference:** Section 2.2.7.3
**Location:** `src/token/token.ts:10`

The COLINFO token is defined but not parsed. This token provides additional column information including:
- Number of columns
- For each column: ColNum, TableNum, Status, ColName

### 2.4 OFFSET Token (0x78) - **PARSING MISSING**

**Spec Reference:** Section 2.2.7.15
**Location:** `src/token/token.ts:21`

The OFFSET token (used for cursor positioning) is defined but not parsed.

### 2.5 TABNAME Token (0xA4) - **PARSING MISSING**

**Spec Reference:** Section 2.2.7.22
**Location:** `src/token/token.ts:27`

The TABNAME token is defined but no parser exists. This token contains table name information for browse mode results.

### 2.6 SESSIONSTATE Token (0xE4) - **COMPLETELY MISSING**

**Spec Reference:** Section 2.2.7.21 (introduced in TDS 7.4)

This token for session state management is not even defined in the token constants. Used for connection resiliency features.

### 2.7 DATACLASSIFICATION Token (0xA3) - **COMPLETELY MISSING**

**Spec Reference:** Section 2.2.7.5 (introduced in TDS 7.4)

Data classification/sensitivity labels token is not implemented. This is used for data governance features.

---

## 3. ENVCHANGE TOKEN DEVIATIONS

### 3.1 Missing ENVCHANGE Types

**Spec Reference:** Section 2.2.7.9
**Location:** `src/token/env-change-token-parser.ts:21-69`

The following ENVCHANGE types from the specification are not handled:

| Type | Name | Status |
|------|------|--------|
| 5 | Unicode data sorting local id | Missing |
| 6 | Unicode data sorting comparison flags | Missing |
| 11 | User Instance Started | Missing |
| 12 | User Instance Name | Missing |
| 14 | DEFECTENVCHANGE | Missing |
| 15 | TM_PROMOTE_XACT (Mirror transaction envelope) | Missing |
| 16 | TM_PROPAGATE_XACT (Propagate to DTC) | Missing |
| 19 | Compress client to server communication | Missing |
| 21 | Server Supports Data Classification | Missing |

The implementation only handles types: 1, 2, 3, 4, 7, 8, 9, 10, 13, 17, 18, 20.

---

## 4. PRELOGIN DEVIATIONS

### 4.1 Missing PRELOGIN Options

**Spec Reference:** Section 2.2.6.5
**Location:** `src/prelogin-payload.ts:9-18`

Current implementation handles:
- VERSION (0x00) ✓
- ENCRYPTION (0x01) ✓
- INSTOPT (0x02) ✓
- THREADID (0x03) ✓
- MARS (0x04) ✓
- TRACEID (0x05) ✓
- FEDAUTHREQUIRED (0x06) ✓

**Missing options from spec:**
- NONCEOPT (0x07) - Nonce for federated auth challenge
- LASTPRELOGINIDX (0x08) - Last valid prelogin index marker

### 4.2 NONCE Handling Missing

**Spec Reference:** Section 2.2.6.5

The specification states that if a server provides a NONCE during prelogin, the client MUST echo it back in the FEDAUTH token message. This nonce handling is not fully implemented.

---

## 5. LOGIN7 DEVIATIONS

### 5.1 OptionFlags2 Incomplete

**Spec Reference:** Section 2.2.6.4
**Location:** `src/login7-payload.ts:22-35`

The FLAGS_2 definition is missing proper bit shifting for:
- `fUserType bits 4-6` - User type values (NORMAL=0, SERVER=1, REMUSER=2, SQLREPL=3)

Current implementation only handles USER_NORMAL, USER_SERVER, USER_REMUSER, USER_SQLREPL but doesn't correctly shift the bits for USER_TYPE field.

### 5.2 Missing Feature Extensions

**Spec Reference:** Section 2.2.6.4
**Location:** `src/login7-payload.ts:388-432`

The following feature extensions are not supported:

| Feature ID | Name | Status |
|------------|------|--------|
| 0x01 | SESSIONRECOVERY | Missing |
| 0x04 | COLUMNENCRYPTION | Partial (Always Encrypted exists but not complete) |
| 0x05 | GLOBALTRANSACTIONS | Missing |
| 0x06 | AZURESQLSUPPORT (deprecated) | Missing |
| 0x07 | DATACLASSIFICATION | Missing |
| 0x08 | AZURESQLSUPPORT (new) | Missing |
| 0x09 | AZURESQLDNSCACHING | Missing |

Currently only implemented:
- FEDAUTH (0x02) ✓
- UTF8_SUPPORT (0x0A) ✓

### 5.3 TDS 8.0 Features Missing

**Spec Reference:** Section 2.2.6.4

TDS version 8.0 (0x08000000) is listed in `tds-versions.ts` but the associated features (DSCP value in prelogin, etc.) are not implemented.

---

## 6. FEATURE EXTENSION ACK PARSING INCOMPLETE

**Location:** `src/token/feature-ext-ack-parser.ts:6-14`

The parser only handles:
- SESSIONRECOVERY (0x01) - Defined but not processed
- FEDAUTH (0x02) ✓
- COLUMNENCRYPTION (0x04) - Defined but not processed
- GLOBALTRANSACTIONS (0x05) - Defined but not processed
- AZURESQLSUPPORT (0x08) - Defined but not processed
- UTF8_SUPPORT (0x0A) ✓

Only FEDAUTH and UTF8_SUPPORT are actually extracted and returned in the token.

---

## 7. DATA TYPE IMPLEMENTATION ISSUES

### 7.1 UDT (User-Defined Type) - **NOT IMPLEMENTED**

**Spec Reference:** Section 2.2.5.5.2
**Location:** `src/data-types/udt.ts`

```typescript
// All methods throw "not implemented"
generateTypeInfo() { throw new Error('not implemented'); }
generateParameterLength() { throw new Error('not implemented'); }
generateParameterData() { throw new Error('not implemented'); }
validate() { throw new Error('not implemented'); }
```

UDT can be read from server responses (via metadata parser) but cannot be sent as parameters.

### 7.2 XML Type - **NOT IMPLEMENTED FOR PARAMETERS**

**Spec Reference:** Section 2.2.5.5.3
**Location:** `src/data-types/xml.ts`

Same as UDT - all parameter methods throw "not implemented". Can only be received, not sent.

### 7.3 SQL Variant - **NOT IMPLEMENTED FOR PARAMETERS**

**Spec Reference:** Section 2.2.5.5.4
**Location:** `src/data-types/sql-variant.ts`

Can only receive sql_variant values, cannot send as parameters.

### 7.4 Decimal/Numeric Precision Limits

**Spec Reference:** Section 2.2.5.5.1.6
**Location:** `src/data-types/numeric.ts`, `src/data-types/decimal.ts`

The spec says precision can be 1-38, with corresponding data lengths:
- 4 bytes if 1 <= p <= 9
- 8 bytes if 10 <= p <= 19
- 12 bytes if 20 <= p <= 28
- 16 bytes if 29 <= p <= 38

The documentation in `src/data-type.ts:417-419` states "Maximum supported precision is 19", which is a significant limitation compared to the spec's maximum of 38.

---

## 8. RPC REQUEST DEVIATIONS

### 8.1 Missing OptionFlags

**Spec Reference:** Section 2.2.6.6
**Location:** `src/rpcrequest-payload.ts:8-12`

The following option flags are defined in comments but never used:
```typescript
// const OPTION = {
//   WITH_RECOMPILE: 0x01,
//   NO_METADATA: 0x02,
//   REUSE_METADATA: 0x04
// };
```

The implementation always sends `optionFlags = 0`.

### 8.2 Missing fEncrypted Status Flag

**Spec Reference:** Section 2.2.6.6

The status flag for encrypted parameters (`fEncrypted = 0x04`) is not implemented:
```typescript
// Current implementation only handles:
STATUS.BY_REF_VALUE = 0x01
STATUS.DEFAULT_VALUE = 0x02
// Missing: fEncrypted = 0x04
```

### 8.3 Missing BatchFlag and NoExecFlag

**Spec Reference:** Section 2.2.6.6

For batched RPC requests, the spec defines:
- BatchFlag (0x80) - Distinguishes start of next RPC
- NoExecFlag (0xFF) - Indicates RPC should not execute

These are not implemented in tedious.

---

## 9. TRANSACTION MANAGER DEVIATIONS

### 9.1 Missing DTC Operations

**Spec Reference:** Section 2.2.6.9
**Location:** `src/transaction.ts:8-16`

The following transaction manager operations are missing:
- TM_GET_DTC_ADDRESS (0x00) - Get DTC network address
- TM_PROPAGATE_XACT (0x01) - Import DTC transaction
- TM_PROMOTE_XACT (0x06) - Promote local to distributed

Currently implemented:
- TM_BEGIN_XACT (0x05) ✓
- TM_COMMIT_XACT (0x07) ✓
- TM_ROLLBACK_XACT (0x08) ✓
- TM_SAVE_XACT (0x09) ✓

### 9.2 Missing fBeginXact Flag in Commit/Rollback

**Spec Reference:** Section 2.2.6.9

The commit and rollback payloads always set `fBeginXact = 0`:
```typescript
// No fBeginXact flag, so no new transaction is started.
buffer.writeUInt8(0);
```

The spec allows `fBeginXact = 1` to start a new transaction after commit/rollback, which could be useful for transaction chaining.

---

## 10. BULK LOAD DEVIATIONS

### 10.1 NBCROW Not Sent

**Spec Reference:** Section 2.2.7.13
**Location:** `src/bulk-load.ts:124`

The bulk load always sends ROW tokens (0xD1), but never sends NBCROW (Null Bitmap Compressed Row, 0xD2). NBCROW is more efficient when there are many NULL values as it uses a bitmap instead of repeating NULL markers.

### 10.2 XML/UDT Types Not Supported

**Spec Reference:** Section 2.2.6.1

Per the spec:
> Note that for INSERT BULK operations, XMLTYPE is to be sent as NVARCHAR(N) or NVARCHAR(MAX) data type.
> INSERT BULK operations for data type UDTTYPE is not supported. Use VARBINARYTYPE.

Tedious doesn't provide guidance or automatic conversion for these types in bulk load operations.

---

## 11. ATTENTION SIGNAL

### 11.1 Basic Implementation Present but Limited

**Spec Reference:** Section 2.2.1.6
**Location:** `src/connection.ts:1784`, `src/packet.ts:9`

The attention signal is implemented (`TYPE.ATTENTION = 0x06`), but the handling is basic. The spec indicates attention should immediately stop query processing, but tedious still reads and discards all remaining tokens.

---

## 12. DONE TOKEN DEVIATIONS

### 12.1 INXACT Status Not Exposed

**Spec Reference:** Section 2.2.7.6
**Location:** `src/token/done-token-parser.ts:7-15`

The comment in the code states:
```typescript
// This bit is not yet in use by SQL Server, so is not exposed in the returned token
INXACT: 0x0004,
```

However, the specification defines this bit (DONE_INXACT) as indicating the token is within a transaction. While SQL Server may not set this bit, the parser should still expose it.

---

## 13. INFO/ERROR TOKEN - **COMPLIANT**

**Location:** `src/token/infoerror-token-parser.ts`

The implementation correctly parses:
- Number (4 bytes)
- State (1 byte)
- Class (1 byte)
- Message (US_VARCHAR)
- ServerName (B_VARCHAR)
- ProcName (B_VARCHAR)
- LineNumber (2 bytes for < 7.2, 4 bytes for >= 7.2)

This matches the specification.

---

## 14. LOGINACK TOKEN - **COMPLIANT**

**Spec Reference:** Section 2.2.7.14
**Location:** `src/token/loginack-token-parser.ts:8-11`

```typescript
const interfaceTypes: { [key: number]: string } = {
  0: 'SQL_DFLT',
  1: 'SQL_TSQL'
};
```

The specification only defines these two values, so this is correct.

---

## 15. SPECIAL STORED PROCEDURES - **COMPLIANT**

**Location:** `src/special-stored-procedure.ts`

All 15 special stored procedures are correctly defined with their procedure IDs:
- Sp_Cursor (1) through Sp_Unprepare (15)

This matches the specification.

---

## 16. TDS VERSIONS - **COMPLIANT**

**Location:** `src/tds-versions.ts`

```typescript
versions = {
  '7_1': 0x71000001,
  '7_2': 0x72090002,
  '7_3_A': 0x730A0003,
  '7_3_B': 0x730B0003,
  '7_4': 0x74000004,
  '8_0': 0x08000000
};
```

This appears correct per the specification, though TDS 8.0 features are not fully implemented.

---

## 17. PACKET HEADER - **COMPLIANT**

**Location:** `src/packet.ts`

The 8-byte packet header is correctly implemented:
- Type (1 byte)
- Status (1 byte)
- Length (2 bytes, big-endian)
- SPID (2 bytes, big-endian)
- PacketID (1 byte)
- Window (1 byte)

Status flags are correctly defined:
- NORMAL (0x00)
- EOM (0x01)
- IGNORE (0x02)
- RESETCONNECTION (0x08)
- RESETCONNECTIONSKIPTRAN (0x10)

---

## 18. SUMMARY OF CRITICAL GAPS

### High Priority (Security/Compatibility):

1. **Column Encryption** - Only partial support for Always Encrypted
2. **Session Recovery** - No connection resiliency support
3. **Data Classification** - Missing data governance features

### Medium Priority (Functionality):

4. **JSON Type** - Cannot handle JSON data type natively
5. **Vector Type** - No support for vector/embedding data
6. **UDT/XML/Variant as parameters** - Read-only support
7. **Decimal precision 20-38** - Limited to precision 19

### Lower Priority (Completeness):

8. **Various unparsed tokens** (ALTMETADATA, ALTROW, COLINFO, etc.)
9. **Missing ENVCHANGE types**
10. **DTC transaction support**
11. **RPC batching flags**

---

## 19. RECOMMENDATIONS

1. **Prioritize JSON Type**: SQL Server 2016+ has native JSON support; this is commonly needed.

2. **Implement Session Recovery**: Critical for Azure SQL Database connection resilience.

3. **Add Vector Type**: Growing importance with AI/ML workloads.

4. **Complete Column Encryption**: Security-critical feature for sensitive data.

5. **Increase Decimal Precision**: Limiting to 19 digits affects financial applications.

6. **Add Missing Token Parsers**: Even if not commonly used, proper parsing prevents errors.

---

## Appendix A: File Location Reference

| Component | File Location |
|-----------|---------------|
| Packet Header | `src/packet.ts` |
| Token Definitions | `src/token/token.ts` |
| Data Types | `src/data-type.ts`, `src/data-types/*.ts` |
| Prelogin | `src/prelogin-payload.ts` |
| Login7 | `src/login7-payload.ts` |
| Bulk Load | `src/bulk-load.ts` |
| RPC Request | `src/rpcrequest-payload.ts` |
| Transaction | `src/transaction.ts` |
| ENVCHANGE Parser | `src/token/env-change-token-parser.ts` |
| DONE Parser | `src/token/done-token-parser.ts` |
| Feature Ext Ack | `src/token/feature-ext-ack-parser.ts` |
| Metadata Parser | `src/metadata-parser.ts` |
| Connection | `src/connection.ts` |

---

## Appendix B: Specification Reference

- **Document:** [MS-TDS]: Tabular Data Stream Protocol
- **Version:** v20251031
- **Release Date:** October 31, 2025
- **Publisher:** Microsoft Corporation
