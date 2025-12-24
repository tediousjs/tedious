# Tedious Codebase Review

This document provides an in-depth analysis of potential improvements across performance, API design, internals, testing, and other areas.

---

## Table of Contents

1. [Performance](#1-performance)
2. [API Design](#2-api-design)
3. [Internals & Architecture](#3-internals--architecture)
4. [Testing](#4-testing)
5. [Type Safety](#5-type-safety)
6. [Dependencies & Tooling](#6-dependencies--tooling)
7. [Documentation](#7-documentation)
8. [Security](#8-security)

---

## 1. Performance

### 1.1 Buffer Allocations in WritableTrackingBuffer

**Location**: `src/tracking-buffer/writable-tracking-buffer.ts:59-64`

**Issue**: The `newBuffer()` method creates new composite buffers via `Buffer.concat()` on every resize operation. This is inefficient for frequent small writes.

```typescript
newBuffer(size: number) {
  const buffer = this.buffer.slice(0, this.position);
  this.compositeBuffer = Buffer.concat([this.compositeBuffer, buffer]); // Allocation every time
  this.buffer = (size === 0) ? ZERO_LENGTH_BUFFER : Buffer.alloc(size, 0);
  this.position = 0;
}
```

**Recommendation**:
- Use a `BufferList` (like the `bl` package already in dependencies) to accumulate buffers without copying
- Only concatenate when the final `data` getter is called
- Pre-allocate larger buffers using the `doubleSizeGrowth` strategy more aggressively

### 1.2 Token Parser Uses Recursive Promise Chains

**Location**: `src/token/stream-parser.ts:131-175` (and similar patterns throughout)

**Issue**: When `NotEnoughDataError` is thrown, the parser recursively calls itself via `.then()`:

```typescript
readFeatureExtAckToken(): FeatureExtAckToken | Promise<FeatureExtAckToken> {
  try {
    result = featureExtAckParser(this.buffer, this.position, this.options);
  } catch (err: any) {
    if (err instanceof NotEnoughDataError) {
      return this.waitForChunk().then(() => {
        return this.readFeatureExtAckToken(); // Recursive promise chain
      });
    }
    throw err;
  }
  // ...
}
```

**Recommendation**:
- Refactor to use a loop-based approach with `async/await` to avoid stack growth
- Consider using `while` loops inside async functions instead of recursive `.then()` chains

### 1.3 Repeated Buffer.from() Calls for Static Data

**Location**: Multiple data type files (e.g., `src/data-types/varchar.ts:9-10`)

**Issue**: Static buffers are created at module load, which is good, but some are duplicated across files:

```typescript
const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);
const MAX_NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
```

**Recommendation**:
- Create a shared `constants.ts` module for commonly used static buffers
- Export constants like `NULL_LENGTH_2`, `NULL_LENGTH_8`, `PLP_TERMINATOR`, etc.

### 1.4 String Building in makeParamsParameter

**Location**: `src/request.ts:440-454`

**Issue**: Parameters are built via string concatenation in a loop:

```typescript
makeParamsParameter(parameters: Parameter[]) {
  let paramsParameter = '';
  for (let i = 0, len = parameters.length; i < len; i++) {
    // ... string concatenation
    paramsParameter += '@' + parameter.name + ' ';
    paramsParameter += parameter.type.declaration(parameter);
  }
  return paramsParameter;
}
```

**Recommendation**:
- Use `Array.map().join()` or template literals for cleaner and potentially faster string building
- For large parameter counts, consider using array-based building

### 1.5 Connection.ts File Size

**Location**: `src/connection.ts` (~2500+ lines)

**Issue**: The Connection class is monolithic and handles too many responsibilities, which impacts:
- Initial parse/load time
- Memory footprint
- Maintainability

**Recommendation**:
- Extract state machine logic into a separate `ConnectionStateMachine` class
- Move authentication handling to an `AuthenticationHandler` class
- Extract timer management to a `ConnectionTimers` utility

---

## 2. API Design

### 2.1 Callback-Based API Without Promise Support

**Location**: `src/connection.ts` - `execSql`, `execSqlBatch`, `callProcedure`, etc.

**Issue**: The primary API is callback-based. While events are available, there's no built-in promise wrapper:

```typescript
connection.execSql(request); // Request uses callbacks
```

**Recommendation**:
- Add `execSqlAsync()`, `execSqlBatchAsync()`, etc. that return Promises
- Or add a `promisify` helper in the package
- Consider an async iterator API for streaming results

### 2.2 Inconsistent Row Return Types

**Location**: `src/request.ts:32-33`, `src/token/handler.ts:469-478`

**Issue**: Row results can be either arrays or objects depending on `useColumnNames` option, making TypeScript typing difficult:

```typescript
// TODO: Figure out how to type the `rows` parameter here.
(error: Error | null | undefined, rowCount?: number, rows?: any) => void;
```

**Recommendation**:
- Create distinct types for array and object row formats
- Use generics or discriminated unions to properly type results
- Consider deprecating one format in favor of consistency

### 2.3 Mixed Export Patterns

**Location**: Throughout the codebase

**Issue**: Files use both `export default` and `module.exports`:

```typescript
export default VarChar;
module.exports = VarChar;
```

**Recommendation**:
- Standardize on ES module exports only
- The dual export pattern is legacy and can be removed since the package targets Node 18+

### 2.4 Parameter Options Spread Across Multiple Locations

**Location**: `src/request.ts:35-40`, `src/bulk-load.ts:95-122`

**Issue**: `ParameterOptions` and `ColumnOptions` have similar but not identical shapes:

```typescript
// request.ts
interface ParameterOptions {
  output?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
}

// bulk-load.ts
interface ColumnOptions {
  output?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  objName?: string;
  nullable?: boolean;
}
```

**Recommendation**:
- Create a shared base interface and extend it
- Consolidate parameter/column option handling

### 2.5 Error Classes Missing Stack Trace Preservation

**Location**: `src/errors.ts`

**Issue**: Error classes don't call `Error.captureStackTrace()`:

```typescript
export class ConnectionError extends Error {
  constructor(message: string, code?: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    // Missing: Error.captureStackTrace(this, this.constructor);
  }
}
```

**Recommendation**:
- Add `Error.captureStackTrace(this, this.constructor)` to preserve proper stack traces
- Set `this.name = this.constructor.name` for better error identification

---

## 3. Internals & Architecture

### 3.1 Excessive Use of `declare` Field Declarations

**Location**: Throughout `src/connection.ts`, `src/request.ts`, etc.

**Issue**: Heavy use of `declare` makes it unclear when fields are actually initialized:

```typescript
class Connection extends EventEmitter {
  declare fedAuthRequired: boolean;
  declare config: InternalConnectionConfig;
  declare secureContextOptions: SecureContextOptions;
  // 30+ more declare statements...
}
```

**Recommendation**:
- Initialize fields in constructor with explicit defaults
- Use `declare` only for fields that are definitely set elsewhere (e.g., by decorators)
- Consider using definite assignment assertion (`!`) sparingly with proper initialization

### 3.2 State Machine Implementation is Partially Used

**Location**: `src/connection.ts:2329-2345`

**Issue**: The state machine pattern is defined but the actual connection flow uses a mix of state transitions and direct async/await flow control:

```typescript
transitionTo(newState: State) {
  // State transitions
}

async initialiseConnection() {
  // But actual flow uses direct async/await, not state-driven
}
```

**Recommendation**:
- Either fully commit to state machine pattern with event-driven transitions
- Or remove the partial state machine and use pure async/await flow
- The current hybrid approach is confusing

### 3.3 Data Type Modules Lack Consistent Structure

**Location**: `src/data-types/*.ts`

**Issue**: Data type modules have inconsistent patterns:

```typescript
// Some use object literals
const VarChar: DataType = { id: 0xA7, ... };

// Some have extra properties
const Decimal: DataType & { resolvePrecision: ..., resolveScale: ... } = { ... };
```

**Recommendation**:
- Create a base class or factory function for data types
- Enforce consistent method signatures across all types
- Consider using a class-based approach for better extensibility

### 3.4 Token Handler Pattern Creates Tight Coupling

**Location**: `src/token/handler.ts`

**Issue**: Token handlers have direct references to Connection internals:

```typescript
onPacketSizeChange(token: PacketSizeEnvChangeToken) {
  this.connection.messageIo.packetSize(token.newValue); // Direct internal access
}
```

**Recommendation**:
- Token handlers should emit events or return instructions
- Connection should interpret and apply changes
- This enables better testing and reduces coupling

### 3.5 Magic Numbers Throughout

**Location**: Various files

**Issue**: Magic numbers are used without constants:

```typescript
// bulk-load.ts
if ((type.id & 0x30) === 0x20) { // What does 0x30 and 0x20 mean?

// decimal.ts
if (parameter.precision! <= 9) {
  precision = 0x05;
} else if (parameter.precision! <= 19) {
  precision = 0x09;
}
```

**Recommendation**:
- Define named constants for bit masks and thresholds
- Document what these values represent in the TDS protocol

### 3.6 Duplicate Code in Token Parsing

**Location**: `src/token/stream-parser.ts`

**Issue**: Nearly identical try/catch/retry patterns repeated for each token type:

```typescript
readFeatureExtAckToken() { try { ... } catch { if (NotEnoughDataError) return waitForChunk().then(readFeatureExtAckToken) } }
readSSPIToken() { try { ... } catch { if (NotEnoughDataError) return waitForChunk().then(readSSPIToken) } }
readFedAuthInfoToken() { try { ... } catch { if (NotEnoughDataError) return waitForChunk().then(readFedAuthInfoToken) } }
// ... repeated 10+ times
```

**Recommendation**:
- Create a generic `readWithRetry<T>(parser: () => T): T | Promise<T>` helper
- Reduce the 15+ near-identical methods to use the common helper

---

## 4. Testing

### 4.1 Missing Unit Test Coverage for Data Types

**Location**: `test/unit/data-type.ts` tests exist but don't cover all edge cases

**Issue**: While there's a comprehensive data type test file, validation edge cases and error conditions need more coverage.

**Recommendation**:
- Add tests for boundary values (max/min for each type)
- Test error messages for validation failures
- Add property-based testing for numeric types

### 4.2 Integration Tests Rely on External SQL Server

**Location**: `test/integration/*.ts`

**Issue**: Integration tests require a running SQL Server instance, making local development difficult.

**Recommendation**:
- Improve Docker-based testing documentation
- Add a "mock server" mode for basic protocol testing
- Consider using testcontainers-node for automatic container management

### 4.3 Test Files Mix TypeScript and JavaScript Patterns

**Location**: `test/setup.js` uses Babel to transpile tests

**Issue**: Tests use Babel registration at runtime instead of pre-compilation.

**Recommendation**:
- Pre-compile tests like source code
- Use `tsx` or native TypeScript test runner for faster execution
- Align test build process with source build process

### 4.4 No Tests for Token Handler Error Paths

**Location**: `src/token/handler.ts`

**Issue**: `UnexpectedTokenError` paths are not tested. The base `TokenHandler` class throws on all methods.

**Recommendation**:
- Add tests verifying unexpected token handling
- Test that handlers correctly reject invalid states

### 4.5 Performance Tests Could Be More Automated

**Location**: `test/performance/`, `benchmarks/`

**Issue**: Performance tests exist but aren't integrated into CI.

**Recommendation**:
- Add benchmark comparisons to PR checks
- Track performance regressions over time
- Use consistent benchmarking methodology

---

## 5. Type Safety

### 5.1 Extensive Use of `any` Type

**Location**: Multiple files

**Issue**: Many places use `any` type, reducing type safety:

```typescript
// request.ts:104
declare rows?: Array<any>;
declare rst?: Array<any>;

// data-type.ts:83
validate(value: any, collation: Collation | undefined, options?: InternalConnectionOptions): any;

// tracking-buffer/writable-tracking-buffer.ts:215
writeUsVarbyte(value: any, encoding?: Encoding | null)
```

**Recommendation**:
- Replace `any` with `unknown` where possible
- Create proper type definitions for row data
- Use generics for value types in data type validation

### 5.2 Non-null Assertions Overused

**Location**: Throughout the codebase

**Issue**: Excessive use of `!` (non-null assertion):

```typescript
// decimal.ts:72
const value = Math.round(Math.abs(parameter.value * Math.pow(10, parameter.scale!)));
const precision = parameter.precision!;

// handler.ts:506
this.request.rowCount! += token.rowCount;
```

**Recommendation**:
- Add proper null checks or use optional chaining
- Initialize values to avoid needing non-null assertions
- Use type guards to narrow types

### 5.3 Event Emitter Typing Could Be Improved

**Location**: `src/connection.ts`, `src/request.ts`

**Issue**: Event emitter overloads are verbose and still allow untyped access:

```typescript
on(event: 'charsetChange', listener: (charset: string) => void): this
on(event: 'connect', listener: (err: Error | undefined) => void): this
// ... many more
on(event: string | symbol, listener: (...args: any[]) => void) { // Escape hatch
  return super.on(event, listener);
}
```

**Recommendation**:
- Use a typed event emitter pattern (e.g., `TypedEmitter` from `tiny-typed-emitter`)
- Or use a type-safe event map pattern

---

## 6. Dependencies & Tooling

### 6.1 @types/node in Dependencies (Not DevDependencies)

**Location**: `package.json:49`

**Issue**: `@types/node` is in `dependencies` instead of `devDependencies`:

```json
"dependencies": {
  "@types/node": ">=18",
  // ...
}
```

**Recommendation**:
- Move `@types/node` to `devDependencies`
- Users should have their own `@types/node` matching their Node version

### 6.2 Build Uses Babel Instead of tsc

**Location**: `package.json:95`

**Issue**: TypeScript is compiled via Babel, not `tsc`:

```json
"build": "rimraf lib && babel src --out-dir lib --extensions .js,.ts && npm run build:types"
```

**Recommendation**:
- Consider using `tsc` directly for simpler build pipeline
- Or use `tsup`/`esbuild` for faster builds with better defaults
- Babel adds complexity without clear benefit for a Node library

### 6.3 Missing Lockfile Version Control

**Issue**: No `package-lock.json` or `npm-shrinkwrap.json` visible in common locations.

**Recommendation**:
- Commit lockfile for reproducible builds
- Ensures CI uses same dependency versions as development

### 6.4 ESLint Config Could Be Stricter

**Location**: `eslint.config.mjs`

**Recommendation**:
- Enable stricter TypeScript-ESLint rules
- Add `@typescript-eslint/strict-type-checked` ruleset
- Consider adding `eslint-plugin-import` for import ordering

---

## 7. Documentation

### 7.1 Internal Types Exported Without Documentation

**Location**: `src/tedious.ts`

**Issue**: Many internal types are exported but lack documentation for external consumers.

**Recommendation**:
- Add JSDoc comments to all exported types
- Clearly mark internal vs. public exports
- Consider using `@internal` tags for non-public items

### 7.2 Data Type Documentation is Embedded in Code

**Location**: `src/data-type.ts:134-438`

**Issue**: The data type documentation table is a huge JSDoc comment that's hard to maintain.

**Recommendation**:
- Move to external documentation (TypeDoc output)
- Generate from structured data
- Keep code comments focused on implementation details

### 7.3 Error Codes Not Documented

**Location**: `src/errors.ts`, `src/connection.ts`

**Issue**: Error codes like `ELOGIN`, `ESOCKET`, `ETIMEOUT` are used but not documented.

**Recommendation**:
- Create an error code reference document
- Add JSDoc to error classes explaining codes
- Consider exporting error code constants

---

## 8. Security

### 8.1 Credentials in Config Not Cleared After Use

**Location**: `src/connection.ts`

**Issue**: Password and credentials remain in `this.config` throughout the connection lifetime.

**Recommendation**:
- Clear sensitive credentials after authentication succeeds
- Avoid logging config objects that contain credentials
- Use secure string handling patterns

### 8.2 TLS Version Pinning

**Location**: `src/message-io.ts:65-67`

**Issue**: TLS max version is hardcoded to 1.2:

```typescript
if (!credentialsDetails.maxVersion || !['TLSv1.2', 'TLSv1.1', 'TLSv1'].includes(credentialsDetails.maxVersion)) {
  credentialsDetails.maxVersion = 'TLSv1.2';
}
```

**Recommendation**:
- Allow TLS 1.3 by default (Node 18+ supports it)
- Make TLS version configurable with secure defaults
- Deprecate TLS 1.0 and 1.1 support

### 8.3 SQL Injection Prevention Relies on Parameterization

**Issue**: The library correctly uses parameterized queries, but there's no built-in SQL escaping function for dynamic SQL building.

**Recommendation**:
- Add documentation warning against string interpolation
- Consider adding a tagged template literal helper for safe SQL building
- Provide an `escape` function for edge cases (with strong warnings)

---

## Summary of Priority Improvements

### High Priority
1. Add Promise-based API variants
2. Fix Buffer allocation inefficiency in WritableTrackingBuffer
3. Replace recursive promise chains with async loops in token parser
4. Improve TypeScript types (remove `any`, add generics)

### Medium Priority
5. Extract Connection class responsibilities into smaller classes
6. Create shared buffer constants module
7. Add typed event emitter pattern
8. Improve test coverage for edge cases
9. Move `@types/node` to devDependencies

### Low Priority (Technical Debt)
10. Standardize data type module structure
11. Remove dual export pattern
12. Consolidate duplicate token parsing code
13. Document error codes
14. Allow TLS 1.3

---

*This review was conducted on December 2024 against the current main branch.*
