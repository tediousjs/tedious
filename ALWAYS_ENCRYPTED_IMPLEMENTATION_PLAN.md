# Always Encrypted Implementation Plan for Tedious

## Executive Summary

Tedious has a **partially implemented** Always Encrypted feature. The cryptographic foundation is solid (~80% complete), but the integration into the request/response pipeline is missing. This document outlines a comprehensive plan to fully support Always Encrypted as a first-class feature.

## Current State Analysis

### What's Implemented

| Component | File | Status |
|-----------|------|--------|
| AEAD_AES_256_CBC_HMAC_SHA256 Algorithm | `src/always-encrypted/aead-aes-256-cbc-hmac-algorithm.ts` | Complete |
| Key Derivation | `src/always-encrypted/aead-aes-256-cbc-hmac-encryption-key.ts` | Complete |
| Symmetric Key Management | `src/always-encrypted/symmetric-key.ts` | Complete |
| Symmetric Key Cache (LRU) | `src/always-encrypted/symmetric-key-cache.ts` | Complete |
| CEK Entry Tracking | `src/always-encrypted/cek-entry.ts` | Complete |
| Azure Key Vault Provider | `src/always-encrypted/keystore-provider-azure-key-vault.ts` | Complete |
| Type Definitions | `src/always-encrypted/types.ts` | Complete |
| `encryptWithKey()` function | `src/always-encrypted/key-crypto.ts` | **Defined but never called** |
| `decryptWithKey()` function | `src/always-encrypted/key-crypto.ts` | **Defined but never called** |
| `getParameterEncryptionMetadata()` | `src/always-encrypted/get-parameter-encryption-metadata.ts` | **Defined but never called** |
| `shouldHonorAE()` utility | `src/always-encrypted/utils.ts` | **Defined but never called** |
| Connection options | `src/connection.ts` | Partial (config accepted, not used) |
| Request options | `src/request.ts` | Partial (properties exist, not used) |

### What's Missing

1. **Feature Negotiation**: Column encryption feature not requested in Login7 packet
2. **Server Support Detection**: `COLUMNENCRYPTION` feature in FeatureExtAck not handled
3. **COLMETADATA Encryption Parsing**: CryptoMetadata not parsed from result set metadata
4. **Parameter Encryption Pipeline**: No integration to encrypt parameters before sending
5. **Result Set Decryption Pipeline**: No integration to decrypt encrypted column values
6. **Bulk Load Support**: No encryption support for bulk insert operations
7. **Query Metadata Caching**: No caching of `sp_describe_parameter_encryption` results
8. **Additional Key Store Providers**: Only Azure Key Vault implemented
9. **Always Encrypted v2 (Enclave)**: No enclave support
10. **Comprehensive Testing**: No tests for Always Encrypted functionality

---

## Implementation Plan

### Phase 1: Core Protocol Integration (Foundation)

#### 1.1 Feature Negotiation in Login7 Packet

**File**: `src/login7-payload.ts`

**Changes Required**:
- Add `COLUMNENCRYPTION` feature ID (0x04) to `buildFeatureExt()`
- Support Always Encrypted version negotiation (v1 = 0x01, v2 = 0x02 for enclaves)
- Accept `columnEncryptionSetting` from connection options

**Specification Reference** (MS-TDS 2.2.6.3):
```
FEATUREEXT_COLUMNENCRYPTION:
  FeatureId = 0x04
  FeatureDataLen = 1
  FeatureData = Version (0x01 for AE v1, 0x02 for AE v2 with enclaves)
```

#### 1.2 Handle COLUMNENCRYPTION in FeatureExtAck

**File**: `src/token/feature-ext-ack-parser.ts`

**Changes Required**:
- Parse `COLUMNENCRYPTION` (0x04) feature acknowledgment
- Extract server's supported AE version
- Store result in connection options (`serverSupportsColumnEncryption`)

```typescript
case FEATURE_ID.COLUMNENCRYPTION:
  columnEncryption = featureData[0]; // Version byte
  break;
```

#### 1.3 Parse CryptoMetadata from COLMETADATA Token

**File**: `src/token/colmetadata-token-parser.ts`

**Changes Required**:
- Check `fEncrypted` flag in column flags (bit 0x0800)
- Parse `CryptoMetaData` structure when flag is set:
  - Ordinal (2 bytes) - CEK table index
  - UserType (4 bytes)
  - BaseTypeInfo (TYPE_INFO) - underlying plaintext type
  - EncryptionAlgo (1 byte) - 2 = AEAD_AES_256_CBC_HMAC_SHA256
  - AlgoName (B_VARCHAR) - only if EncryptionAlgo = 0
  - EncryptionType (1 byte) - 1 = Deterministic, 2 = Randomized
  - NormVersion (1 byte)

**File**: `src/metadata-parser.ts`

**Changes Required**:
- Add `readCryptoMetadata()` function
- Return `CryptoMetadata` in metadata result

#### 1.4 Parse CEK Table from COLMETADATA

**File**: `src/token/colmetadata-token-parser.ts`

**Changes Required**:
- Parse CEK table header (when AE is negotiated):
  - EkValueCount (2 bytes)
  - For each CEK entry:
    - EncryptedKeyLen (2 bytes)
    - EncryptedKey (variable)
    - KeyStoreName (B_VARCHAR)
    - KeyPath (B_VARCHAR)
    - AlgoName (B_VARCHAR)
- Store CEK table in parser context for use during row parsing

---

### Phase 2: Parameter Encryption Pipeline

#### 2.1 Integrate `getParameterEncryptionMetadata()` into Request Flow

**File**: `src/connection.ts`

**Changes Required**:
- Before executing RPC requests with parameters, check if AE is enabled
- Call `getParameterEncryptionMetadata()` to get encryption info from server
- Cache metadata for query reuse (implement query cache)

**Flow**:
```
1. Request initiated with parameters
2. Check shouldHonorAE(request.statementColumnEncryptionSetting, options.columnEncryptionSetting)
3. If true, call getParameterEncryptionMetadata()
4. Wait for metadata response
5. Attach cryptoMetadata to each parameter
6. Proceed with request execution
```

#### 2.2 Encrypt Parameters in RPC Payload

**File**: `src/rpcrequest-payload.ts`

**Changes Required**:
- Modify `generateParameterData()` to check for `parameter.cryptoMetadata`
- If cryptoMetadata exists, call `encryptWithKey()` to encrypt the value
- Send encrypted value as VarBinary with correct type info
- Handle `forceEncrypt` flag validation

```typescript
* generateParameterData(parameter: Parameter) {
  // ... existing code ...

  if (parameter.cryptoMetadata) {
    // Serialize value to bytes using base type
    const plaintext = this.serializeValue(parameter);

    // Encrypt
    const ciphertext = await encryptWithKey(plaintext, parameter.cryptoMetadata, this.options);

    // Send as encrypted binary
    yield this.generateEncryptedParameterData(ciphertext, parameter.cryptoMetadata);
  } else {
    // ... existing unencrypted path ...
  }
}
```

#### 2.3 Type Normalization for Encryption

**File**: `src/always-encrypted/type-normalizer.ts` (new file)

**Purpose**: Serialize JavaScript values to normalized binary format for encryption

**Changes Required**:
- Create serialization functions for each SQL Server data type
- Handle date/time type normalization
- Handle string encoding normalization
- Handle numeric type normalization with proper precision/scale

---

### Phase 3: Result Set Decryption Pipeline

#### 3.1 Decrypt Values in Row Parser

**File**: `src/token/row-token-parser.ts`

**Changes Required**:
- Check if column has `cryptoMetadata` in metadata
- If encrypted, read value as binary
- Call `decryptWithKey()` to decrypt
- Parse decrypted bytes using `baseTypeInfo` from cryptoMetadata
- Return plaintext value to application

```typescript
async function rowParser(parser: Parser): Promise<RowToken> {
  for (const metadata of parser.colMetadata) {
    if (metadata.cryptoMetadata) {
      // Read encrypted binary
      const ciphertext = await readEncryptedValue(parser, metadata);

      // Decrypt
      const plaintext = decryptWithKey(ciphertext, metadata.cryptoMetadata, options);

      // Parse plaintext using base type
      const value = parseValue(plaintext, metadata.cryptoMetadata.baseTypeInfo);

      columns.push({ value, metadata });
    } else {
      // ... existing unencrypted path ...
    }
  }
}
```

#### 3.2 Handle CEK Decryption with Key Store Providers

**File**: `src/always-encrypted/symmetric-key-cache.ts`

**Changes Required**:
- Before decrypting column values, ensure CEK is decrypted
- Look up appropriate key store provider
- Decrypt CEK using CMK from provider
- Cache decrypted symmetric key

---

### Phase 4: Key Store Provider Architecture

#### 4.1 Abstract Key Store Provider Interface

**File**: `src/always-encrypted/keystore-provider.ts` (new file)

```typescript
export interface ColumnEncryptionKeyStoreProvider {
  readonly name: string;

  decryptColumnEncryptionKey(
    masterKeyPath: string,
    encryptionAlgorithm: string,
    encryptedColumnEncryptionKey: Buffer
  ): Promise<Buffer>;

  encryptColumnEncryptionKey(
    masterKeyPath: string,
    encryptionAlgorithm: string,
    columnEncryptionKey: Buffer
  ): Promise<Buffer>;

  signColumnMasterKeyMetadata(
    masterKeyPath: string,
    allowEnclaveComputations: boolean
  ): Promise<Buffer>;

  verifyColumnMasterKeyMetadata(
    masterKeyPath: string,
    allowEnclaveComputations: boolean,
    signature: Buffer
  ): Promise<boolean>;
}
```

#### 4.2 Windows Certificate Store Provider

**File**: `src/always-encrypted/keystore-provider-certificate-store.ts` (new file)

**Purpose**: Support Windows Certificate Store CMKs (Windows only)

**Implementation**:
- Use `node-ffi` or native addon for Windows CryptoAPI
- Support CurrentUser and LocalMachine stores
- Implement RSA-OAEP unwrapping

#### 4.3 Local Certificate Provider

**File**: `src/always-encrypted/keystore-provider-local-certificate.ts` (new file)

**Purpose**: Support file-based certificates (cross-platform)

**Implementation**:
- Load PFX/PEM certificates from file system
- Use Node.js crypto for RSA operations
- Configurable certificate path and password

#### 4.4 Custom Provider Registration

**File**: `src/connection.ts`

**Changes Required**:
- Add `registerColumnEncryptionKeyStoreProviders()` method
- Validate provider names (must start with "AZURE_KEY_VAULT" or custom prefix)
- Store providers in connection context

---

### Phase 5: Query Metadata Caching

#### 5.1 Implement Parameter Encryption Metadata Cache

**File**: `src/always-encrypted/metadata-cache.ts` (new file)

**Purpose**: Cache `sp_describe_parameter_encryption` results per query

**Implementation**:
```typescript
interface CachedMetadata {
  cekEntries: CEKEntry[];
  parameterMetadata: Map<string, CryptoMetadata>;
  timestamp: number;
}

class ParameterEncryptionMetadataCache {
  private cache: LRUCache<string, CachedMetadata>;

  // Key = normalized SQL text hash
  get(sqlText: string): CachedMetadata | undefined;
  set(sqlText: string, metadata: CachedMetadata): void;
  invalidate(sqlText: string): void;
  clear(): void;
}
```

**Benefits**:
- Avoid repeated `sp_describe_parameter_encryption` calls
- Significant performance improvement for repeated queries

---

### Phase 6: Bulk Load Support

#### 6.1 Add Encryption Support to Bulk Load

**File**: `src/bulk-load.ts`

**Changes Required**:
- Add `cryptoMetadata` support to column options
- Encrypt values before serialization
- Handle batch encryption efficiently

**File**: `src/bulk-load-payload.ts`

**Changes Required**:
- Generate encrypted column metadata
- Serialize encrypted values correctly

---

### Phase 7: Always Encrypted v2 (Enclave Support)

#### 7.1 Enclave Session Management

**File**: `src/always-encrypted/enclave-session.ts` (new file)

**Purpose**: Manage secure enclave sessions for rich computations

**Implementation**:
- Enclave type detection (VBS, SGX)
- Attestation protocol support
- Secure channel establishment
- Session caching

#### 7.2 Enclave Attestation Providers

**File**: `src/always-encrypted/attestation-provider-hgs.ts` (new file)

**Purpose**: Host Guardian Service attestation for VBS enclaves

**File**: `src/always-encrypted/attestation-provider-azure.ts` (new file)

**Purpose**: Microsoft Azure Attestation for SGX enclaves

#### 7.3 Rich Query Support

**Changes Required**:
- Support parameterized queries on encrypted columns
- Enable pattern matching on deterministically encrypted columns
- Support range queries with enclave

**Note**: This is a significant feature addition and may be deferred to a later release.

---

### Phase 8: Error Handling and Diagnostics

#### 8.1 Comprehensive Error Types

**File**: `src/always-encrypted/errors.ts` (new file)

```typescript
export class AlwaysEncryptedError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AlwaysEncryptedError';
  }
}

export class KeyStoreProviderNotFoundError extends AlwaysEncryptedError {}
export class DecryptionFailedError extends AlwaysEncryptedError {}
export class EncryptionFailedError extends AlwaysEncryptedError {}
export class MetadataRetrievalError extends AlwaysEncryptedError {}
export class CertificateNotFoundError extends AlwaysEncryptedError {}
export class EnclaveAttestationError extends AlwaysEncryptedError {}
```

#### 8.2 Trusted Master Key Path Validation

**File**: `src/connection.ts`

**Changes Required**:
- Add `columnEncryptionTrustedMasterKeyPaths` option
- Validate CMK paths against whitelist before decryption
- Prevent malicious key redirection attacks

---

### Phase 9: Testing

#### 9.1 Unit Tests

**File**: `test/unit/always-encrypted/` (new directory)

| Test File | Coverage |
|-----------|----------|
| `aead-algorithm-test.ts` | Encryption/decryption algorithm |
| `key-derivation-test.ts` | HMAC-SHA256 key derivation |
| `cek-entry-test.ts` | CEK metadata handling |
| `metadata-cache-test.ts` | Query metadata caching |
| `type-normalizer-test.ts` | Value serialization |

#### 9.2 Integration Tests

**File**: `test/integration/always-encrypted/` (new directory)

| Test File | Coverage |
|-----------|----------|
| `parameter-encryption-test.ts` | End-to-end parameter encryption |
| `result-decryption-test.ts` | End-to-end result decryption |
| `deterministic-encryption-test.ts` | Deterministic encryption behavior |
| `randomized-encryption-test.ts` | Randomized encryption behavior |
| `bulk-load-encryption-test.ts` | Bulk load with encryption |
| `key-rotation-test.ts` | CEK/CMK rotation scenarios |
| `error-handling-test.ts` | Error conditions and recovery |

**Test Requirements**:
- SQL Server with Always Encrypted enabled
- Test database with encrypted columns
- Azure Key Vault instance for CMK tests
- Certificate store entries for local tests

---

### Phase 10: Documentation

#### 10.1 User Documentation

**File**: `docs/always-encrypted.md` (new file)

**Contents**:
- Feature overview
- Connection configuration
- Key store provider setup
- Usage examples
- Troubleshooting guide
- Security best practices

#### 10.2 API Documentation

- Update JSDoc comments on all public APIs
- Document connection options
- Document request options
- Document key store provider interface

---

## Implementation Priority

### Must Have (MVP)

1. **Phase 1**: Core Protocol Integration
2. **Phase 2**: Parameter Encryption Pipeline
3. **Phase 3**: Result Set Decryption Pipeline
4. **Phase 4.1**: Abstract Key Store Provider Interface
5. **Phase 8.1**: Error Types

### Should Have

6. **Phase 4.2-4.4**: Additional Key Store Providers
7. **Phase 5**: Query Metadata Caching
8. **Phase 8.2**: Trusted Master Key Path Validation
9. **Phase 9**: Testing
10. **Phase 10**: Documentation

### Nice to Have (Future)

11. **Phase 6**: Bulk Load Support
12. **Phase 7**: Always Encrypted v2 (Enclave Support)

---

## Technical Considerations

### Performance

- Encryption/decryption adds ~1ms per operation
- Metadata retrieval adds ~10-50ms per unique query (cacheable)
- CEK decryption adds ~50-200ms per key (cacheable)
- Recommend connection pooling for production use

### Security

- CEKs must never be logged or transmitted
- Symmetric key cache must be cleared on connection close
- Support key rotation without application restart
- Validate CMK paths to prevent key substitution attacks

### Compatibility

- Minimum SQL Server 2016 for AE v1
- Minimum SQL Server 2019 for AE v2 (enclaves)
- Azure SQL Database supports AE v1 and v2
- TDS version 7.4+ required

### Dependencies

- `@azure/identity` - Azure authentication
- `@azure/keyvault-keys` - Azure Key Vault operations
- No additional dependencies for core AE support

---

## References

- [MS-TDS Protocol Specification](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-tds/b46a581a-39de-4745-b076-ec4dbb7d13ec)
- [MS-TDS COLMETADATA](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-tds/58880b9f-381c-43b2-bf8b-0727a98c4f4c)
- [Always Encrypted Cryptography](https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/always-encrypted-cryptography)
- [.NET Framework Always Encrypted Guide](https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/develop-using-always-encrypted-with-net-framework-data-provider)
- [mssql-jdbc Always Encrypted Implementation](https://github.com/microsoft/mssql-jdbc) (reference implementation)

---

## Appendix A: File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/login7-payload.ts` | Modify | Add COLUMNENCRYPTION feature negotiation |
| `src/token/feature-ext-ack-parser.ts` | Modify | Parse COLUMNENCRYPTION acknowledgment |
| `src/token/colmetadata-token-parser.ts` | Modify | Parse encryption metadata and CEK table |
| `src/metadata-parser.ts` | Modify | Add readCryptoMetadata function |
| `src/token/row-token-parser.ts` | Modify | Integrate decryption pipeline |
| `src/rpcrequest-payload.ts` | Modify | Integrate encryption pipeline |
| `src/connection.ts` | Modify | Add metadata retrieval flow, provider registration |
| `src/always-encrypted/keystore-provider.ts` | Create | Abstract provider interface |
| `src/always-encrypted/keystore-provider-certificate-store.ts` | Create | Windows cert store provider |
| `src/always-encrypted/keystore-provider-local-certificate.ts` | Create | File-based cert provider |
| `src/always-encrypted/type-normalizer.ts` | Create | Value serialization for encryption |
| `src/always-encrypted/metadata-cache.ts` | Create | Query metadata caching |
| `src/always-encrypted/errors.ts` | Create | Error type definitions |
| `src/always-encrypted/enclave-session.ts` | Create | Enclave support (future) |

---

## Appendix B: Connection Options Reference

```typescript
interface ConnectionOptions {
  // Enable/disable Always Encrypted
  columnEncryptionSetting?: boolean;  // default: false

  // CEK cache TTL in milliseconds
  columnEncryptionKeyCacheTTL?: number;  // default: 7200000 (2 hours)

  // Key store providers map
  encryptionKeyStoreProviders?: {
    [providerName: string]: ColumnEncryptionKeyStoreProvider;
  };

  // Trusted CMK paths (security feature)
  columnEncryptionTrustedMasterKeyPaths?: {
    [serverName: string]: string[];
  };

  // Enclave attestation URL (for AE v2)
  enclaveAttestationUrl?: string;

  // Enclave attestation protocol
  enclaveAttestationProtocol?: 'HGS' | 'AAS' | 'None';
}
```

---

## Appendix C: Request Options Reference

```typescript
interface RequestOptions {
  // Per-statement encryption setting
  statementColumnEncryptionSetting?:
    | 'UseConnectionSetting'  // Use connection-level setting
    | 'Enabled'               // Enable for this request
    | 'ResultSetOnly'         // Only decrypt results, don't encrypt params
    | 'Disabled';             // Disable for this request
}
```
