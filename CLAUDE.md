# CLAUDE.md

This file provides guidance for AI assistants working with the tedious codebase.

## Project Overview

Tedious is a pure JavaScript/TypeScript implementation of the TDS (Tabular Data Stream) protocol for connecting to Microsoft SQL Server. It is the most widely used Node.js driver for SQL Server.

- **Language**: TypeScript (compiled via Babel)
- **Runtime**: Node.js >= 18.17
- **License**: MIT
- **Entry point**: `src/tedious.ts` (exports `Connection`, `Request`, `BulkLoad`, `TYPES`, etc.)
- **Build output**: `lib/` directory (not checked in)

## Commands

### Build
```bash
npm run build          # Full build: clean lib/, transpile with Babel, generate .d.ts files
npm run build:types    # Generate TypeScript declaration files only
```

### Test
```bash
npm test               # Unit tests only (no database required)
npm run test-integration  # Integration tests (requires running SQL Server)
npm run test-all       # Unit + integration tests
```

Unit tests are fast and don't require a database. Integration tests need a SQL Server instance (see `test/docker-compose.linux.yml` for Docker setup).

To run a single test file:
```bash
npx mocha test/unit/some-test.ts
```

### Lint
```bash
npm run lint           # Runs ESLint on src/ and test/, then runs tsc type checking
```

### Docs
```bash
npm run docs           # Generate TypeDoc documentation
```

## Code Style

- **Indentation**: 2 spaces
- **Quotes**: Single quotes (with `avoidEscape`)
- **Semicolons**: Required
- **Line endings**: Unix (LF)
- **Trailing commas**: Only in multiline expressions
- **Brace style**: 1tbs (single-line allowed)
- **Variables**: Use `const`/`let`, never `var`
- **Arrow parens**: Always required `(x) => x`
- **`this` aliasing**: Only allowed as `self`
- **TypeScript member delimiters**: Semicolons in multiline, commas in single-line
- **Return await**: Always use `return await` in async functions (enforced by `@typescript-eslint/return-await`)

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint. Commits must follow the format:

```
type(scope): description
```

Common types: `feat`, `fix`, `test`, `ci`, `docs`, `refactor`, `perf`, `chore`

Releases are automated via `semantic-release` based on commit types.

## Architecture

### Source Layout (`src/`)

```
src/
  tedious.ts              # Main entry point and public API exports
  connection.ts           # Core Connection class (~3800 lines), TDS state machine
  request.ts              # Request class for SQL queries
  bulk-load.ts            # Bulk insert operations
  message-io.ts           # Low-level socket/TLS communication
  packet.ts               # TDS packet structure (8-byte header)
  message.ts              # Protocol message abstraction
  sender.ts               # Network transmission
  connector.ts            # Connection establishment (TCP/named pipes)
  data-type.ts            # DataType interface and TYPES registry
  data-types/             # 30+ SQL data type implementations (int, varchar, datetime, etc.)
  token/                  # TDS token parsing system
    token.ts              # Token type definitions
    stream-parser.ts      # Main token stream parser
    handler.ts            # Token dispatch handlers (Login7, Request, etc.)
    *-token-parser.ts     # Individual token type parsers
  always-encrypted/       # SQL Server Always Encrypted support
  tracking-buffer/        # Buffer utilities for payload construction
  login7-payload.ts       # LOGIN7 authentication payload
  prelogin-payload.ts     # Pre-login negotiation payload
  sqlbatch-payload.ts     # SQL batch execution payload
  rpcrequest-payload.ts   # RPC/stored procedure payload
  ntlm-payload.ts         # NTLM authentication
  collation.ts            # SQL Server collation handling
  metadata-parser.ts      # Column metadata parsing
  value-parser.ts         # Binary-to-JS value parsing
  errors.ts               # ConnectionError, RequestError
  tds-versions.ts         # TDS protocol version constants
  transaction.ts          # Transaction and isolation levels
  instance-lookup.ts      # SQL Server Browser instance discovery
```

### Key Patterns

**State Machine**: `Connection` uses a state machine pattern with states like `Disconnected`, `PreloginResponse`, `Login7Response`, `Ready`, `RequestInProgress`. Each state has `enter()`/`exit()` methods and event handlers.

**Event-Driven**: `Connection` and `Request` extend `EventEmitter`. Key events: `connect`, `end`, `error`, `row`, `done`, `columnMetadata`.

**Token Handler**: Token parsing uses a handler pattern with specialized subclasses (`Login7TokenHandler`, `RequestTokenHandler`, `InitialSqlTokenHandler`, `AttentionTokenHandler`).

**Data Type Strategy**: Each SQL type implements the `DataType` interface with methods for declaration, type info generation, parameter serialization, and validation.

**Generator/Iterator**: Payload classes implement `[Symbol.iterator]()` yielding buffer chunks for streaming serialization.

### Connection Lifecycle

1. Socket connect -> `TransportStarting`
2. PRELOGIN exchange -> TLS negotiation
3. LOGIN7 -> Authentication
4. Initial SQL batch (SET statements) -> `Ready`
5. Execute requests -> `RequestInProgress` -> `Ready`

### Request Flow

1. User calls `connection.execSql(request)` or `connection.callProcedure(request)`
2. Payload constructed (`RpcRequestPayload` or `SqlBatchPayload`)
3. Sent via `MessageIO` -> `OutgoingMessageStream` -> socket
4. Response parsed: socket -> `IncomingMessageStream` -> `TokenStreamParser`
5. Tokens dispatched to handler, events emitted on `Request`

## Test Structure

```
test/
  unit/                   # Unit tests (no database needed)
    token/                # Token parser tests
    tracking-buffer/      # Buffer utility tests
  integration/            # Integration tests (need SQL Server)
    request/              # Request-specific integration tests
  performance/            # Performance benchmarks
  helpers/                # Test utilities (debug options)
  fixtures/               # TLS certs, SQL Server config
  config.ts               # Default test config (Docker)
  config.ci.ts            # CI environment config
  config.appveyor.ts      # AppVeyor CI config
  setup.js                # Mocha setup (Babel register)
```

**Framework**: Mocha + Chai (assertions) + Sinon (mocking) + MITM (network mocking)

**Test naming**: Files use `*-test.ts` suffix. Token parser tests use `*-token-parser-test.ts`.

**Mocha config**: 10-second timeout, requires `test/setup.js` (Babel register).

**Debug tests**: Set `TEDIOUS_DEBUG=packet,data,payload,token` environment variable.

## CI/CD

- **GitHub Actions** (`.github/workflows/nodejs.yml`): Primary CI. Tests on Node 18/20/21, multiple SQL Server versions, multiple TDS protocol versions (7.1-7.4).
- **AppVeyor** (`appveyor.yml`): Windows CI with SQL Server.
- **CodeQL**: Static analysis for security.
- **semantic-release**: Automated npm publishing on merge to release branches.

## Key Dependencies

- `@js-joda/core` - Date/time handling
- `bl` - Buffer list utility
- `iconv-lite` - Character encoding conversion
- `@azure/identity`, `@azure/keyvault-keys` - Azure AD auth and Always Encrypted
- `native-duplexpair` - Duplex pair streams

## Working with Data Types

Data types live in `src/data-types/`. Each file exports a `DataType` object with:
- `id` / `name` - Type identification
- `declaration(parameter)` - SQL type declaration string
- `generateTypeInfo()` - TDS binary type info
- `generateParameterLength()` / `generateParameterData()` - Parameter serialization (generators)
- `validate(value)` - Input validation

The `TYPES` registry in `src/data-type.ts` maps all types by name and by ID.

## Working with Tokens

Token parsers live in `src/token/`. Each parser reads binary data from the TDS stream and produces typed token objects. The `stream-parser.ts` orchestrates parsing, and `handler.ts` dispatches tokens to the appropriate handler based on connection state.
