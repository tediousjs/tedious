# Tedious Promise API Design

This document outlines the design for a new, Promise-based API for tedious. The goal is to create a modern, intuitive API with excellent TypeScript support while maintaining the power and flexibility of the underlying TDS protocol.

## Design Principles

1. **Promise-first**: All async operations return Promises
2. **Type-safe**: Excellent TypeScript support with generics for result types
3. **Ergonomic**: Common operations should be simple; complex operations should be possible
4. **Streaming-friendly**: Support async iterators for memory-efficient processing
5. **Composable**: Small, focused classes that work well together
6. **Safe by default**: Parameterized queries by default to prevent SQL injection

---

## Table of Contents

1. [Connection API](#1-connection-api)
2. [Query Execution](#2-query-execution)
3. [Result Handling](#3-result-handling)
4. [Parameters & Type Safety](#4-parameters--type-safety)
5. [Prepared Statements](#5-prepared-statements)
6. [Transactions](#6-transactions)
7. [Bulk Operations](#7-bulk-operations)
8. [Stored Procedures](#8-stored-procedures)
9. [Error Handling](#9-error-handling)
10. [Connection Pooling](#10-connection-pooling)
11. [Complete Examples](#11-complete-examples)

---

## 1. Connection API

### Option A: Factory Function (Recommended)

```typescript
import { connect, ConnectionConfig } from 'tedious';

// Simple connection
const connection = await connect({
  server: 'localhost',
  database: 'mydb',
  authentication: {
    type: 'default',
    userName: 'sa',
    password: 'password'
  }
});

// Use connection...
await connection.close();
```

### Option B: Class with Explicit Connect

```typescript
import { Connection } from 'tedious';

const connection = new Connection(config);
await connection.connect();

// Use connection...
await connection.close();
```

### Connection Interface

```typescript
interface Connection {
  // Lifecycle
  close(): Promise<void>;
  reset(): Promise<void>;

  // Query execution (see section 2)
  query<T = Row>(sql: string, params?: QueryParams): Promise<Result<T>>;
  queryBatch(sql: string): Promise<Result>;
  execute<T = Row>(procedureName: string, params?: ProcedureParams): Promise<ProcedureResult<T>>;

  // Prepared statements (see section 5)
  prepare<TParams = unknown>(sql: string): Promise<PreparedStatement<TParams>>;

  // Transactions (see section 6)
  beginTransaction(options?: TransactionOptions): Promise<Transaction>;

  // Bulk operations (see section 7)
  bulkInsert(table: string, options?: BulkOptions): BulkInsert;

  // Events (for info/debug messages)
  on(event: 'info', listener: (message: InfoMessage) => void): this;
  on(event: 'debug', listener: (message: string) => void): this;

  // State
  readonly state: ConnectionState;
  readonly serverVersion: string;
  readonly database: string;
}

type ConnectionState = 'connecting' | 'connected' | 'closed';
```

### Configuration

```typescript
interface ConnectionConfig {
  server: string;
  database?: string;

  authentication: AuthenticationConfig;

  // Common options with sensible defaults
  port?: number;                      // default: 1433
  encrypt?: boolean | 'strict';       // default: true
  trustServerCertificate?: boolean;   // default: false
  connectTimeout?: number;            // default: 15000ms
  requestTimeout?: number;            // default: 15000ms

  // Advanced options
  options?: AdvancedConnectionOptions;
}

// Simplified authentication configs
type AuthenticationConfig =
  | { type: 'sql'; userName: string; password: string }
  | { type: 'windows'; domain?: string; userName?: string; password?: string }
  | { type: 'azure-ad-password'; userName: string; password: string }
  | { type: 'azure-ad-msi'; clientId?: string }
  | { type: 'azure-ad-service-principal'; clientId: string; clientSecret: string; tenantId: string }
  | { type: 'azure-ad-default' }
  | { type: 'azure-ad-token'; token: string | (() => Promise<string>) };
```

---

## 2. Query Execution

### Basic Queries

```typescript
// Simple query with inline parameters
const result = await connection.query(
  'SELECT * FROM users WHERE active = @active AND role = @role',
  { active: true, role: 'admin' }
);

// Access all rows at once
console.log(result.rows); // Row[]
console.log(result.rowCount); // number
```

### Streaming Results with Async Iterators

```typescript
// Stream rows one at a time (memory efficient for large result sets)
const result = await connection.query('SELECT * FROM large_table');

for await (const row of result) {
  console.log(row);
}

// Or get all rows at once
const allRows = await result.toArray();
```

### Multiple Result Sets

```typescript
// Query returning multiple result sets
const result = await connection.query(`
  SELECT * FROM users;
  SELECT * FROM orders;
`);

// Iterate through result sets
for await (const resultSet of result.resultSets()) {
  console.log('Columns:', resultSet.columns);
  for await (const row of resultSet) {
    console.log(row);
  }
}

// Or materialize all at once
const [users, orders] = await result.toArrays();
```

### Raw Batch Execution

```typescript
// Execute raw SQL batch (no parameter substitution)
// Useful for DDL statements or dynamic SQL
const result = await connection.queryBatch(`
  CREATE TABLE temp_data (id INT, value NVARCHAR(100));
  INSERT INTO temp_data VALUES (1, 'test');
`);
```

---

## 3. Result Handling

### Result Object Design

#### Option A: Unified Result with Async Iteration (Recommended)

```typescript
interface Result<T = Row> {
  // Metadata
  readonly columns: ColumnMetadata[];
  readonly rowCount: number;

  // Eager access (buffers all rows)
  readonly rows: T[];
  toArray(): Promise<T[]>;

  // Lazy streaming access
  [Symbol.asyncIterator](): AsyncIterator<T>;

  // Multiple result sets
  resultSets(): AsyncIterable<ResultSet<T>>;
  toArrays(): Promise<T[][]>;

  // First row shortcuts
  first(): T | undefined;
  firstOrThrow(): T;

  // Scalar shortcuts
  scalar<V = unknown>(): V | undefined;
  scalarOrThrow<V = unknown>(): V;
}

interface ResultSet<T = Row> {
  readonly columns: ColumnMetadata[];
  readonly rowCount: number;

  [Symbol.asyncIterator](): AsyncIterator<T>;
  toArray(): Promise<T[]>;
}
```

#### Option B: Separate Streaming and Buffered Results

```typescript
// Streaming result (default)
interface StreamingResult<T = Row> {
  readonly columns: ColumnMetadata[];
  [Symbol.asyncIterator](): AsyncIterator<T>;
  buffer(): Promise<BufferedResult<T>>;
}

// Buffered result
interface BufferedResult<T = Row> {
  readonly columns: ColumnMetadata[];
  readonly rows: T[];
  readonly rowCount: number;
}

// Different methods for each style
connection.query(sql, params);           // Returns StreamingResult
connection.queryBuffered(sql, params);   // Returns BufferedResult
```

### Row Representation

#### Option A: Plain Object (Recommended)

```typescript
type Row = Record<string, unknown>;

// Usage
const result = await connection.query<{ id: number; name: string }>(
  'SELECT id, name FROM users'
);

for (const row of result.rows) {
  console.log(row.id, row.name);  // Fully typed
}
```

#### Option B: Column Array with Named Access

```typescript
interface Row {
  [index: number]: ColumnValue;
  [name: string]: ColumnValue;
  readonly length: number;
}

// Access by index or name
const row = result.rows[0];
console.log(row[0]);        // First column
console.log(row['name']);   // Column by name
console.log(row.name);      // Property access
```

### Column Metadata

```typescript
interface ColumnMetadata {
  name: string;
  type: SqlType;
  nullable: boolean;
  identity: boolean;
  readOnly: boolean;

  // Type-specific metadata
  length?: number;
  precision?: number;
  scale?: number;

  // Table info
  tableName?: string;
}
```

---

## 4. Parameters & Type Safety

### Inline Parameters (Simple Cases)

```typescript
// Type inference from values
const result = await connection.query(
  'SELECT * FROM users WHERE id = @id AND name = @name',
  { id: 42, name: 'John' }
);
// Infers: id as Int, name as NVarChar
```

### Explicit Type Specification

```typescript
import { sql, types as t } from 'tedious';

// Option A: Type helper functions
const result = await connection.query(
  'SELECT * FROM users WHERE id = @id AND created > @date',
  {
    id: t.int(42),
    created: t.datetime2(new Date(), { scale: 3 })
  }
);

// Option B: Tagged template literal
const id = 42;
const date = new Date();
const result = await connection.query(sql`
  SELECT * FROM users
  WHERE id = ${id}
  AND created > ${t.datetime2(date)}
`);
```

### Type Helpers

```typescript
const types = {
  // Exact numerics
  int: (value: number) => TypedParam;
  bigint: (value: bigint | number) => TypedParam;
  smallint: (value: number) => TypedParam;
  tinyint: (value: number) => TypedParam;
  decimal: (value: number, precision?: number, scale?: number) => TypedParam;
  numeric: (value: number, precision?: number, scale?: number) => TypedParam;
  bit: (value: boolean) => TypedParam;

  // Approximate numerics
  float: (value: number) => TypedParam;
  real: (value: number) => TypedParam;

  // Strings
  varchar: (value: string, length?: number | 'max') => TypedParam;
  nvarchar: (value: string, length?: number | 'max') => TypedParam;
  char: (value: string, length?: number) => TypedParam;
  nchar: (value: string, length?: number) => TypedParam;
  text: (value: string) => TypedParam;
  ntext: (value: string) => TypedParam;

  // Binary
  binary: (value: Buffer, length?: number) => TypedParam;
  varbinary: (value: Buffer, length?: number | 'max') => TypedParam;

  // Date/Time
  date: (value: Date) => TypedParam;
  time: (value: Date, scale?: number) => TypedParam;
  datetime: (value: Date) => TypedParam;
  datetime2: (value: Date, scale?: number) => TypedParam;
  datetimeoffset: (value: Date, scale?: number) => TypedParam;
  smalldatetime: (value: Date) => TypedParam;

  // Other
  uniqueidentifier: (value: string) => TypedParam;
  xml: (value: string) => TypedParam;

  // Table-valued parameter
  tvp: <T>(typeName: string, rows: T[]) => TypedParam;

  // Output parameter marker
  output: <T extends TypedParam>(param: T) => OutputParam<T>;
};
```

### Tagged Template Literals

```typescript
import { sql, types as t } from 'tedious';

// Automatic parameterization
const userId = 42;
const result = await connection.query(sql`
  SELECT * FROM users WHERE id = ${userId}
`);
// Generates: SELECT * FROM users WHERE id = @p1
// With params: { p1: 42 }

// With explicit types
const result = await connection.query(sql`
  SELECT * FROM products
  WHERE price > ${t.decimal(99.99, 10, 2)}
  AND name LIKE ${t.nvarchar('%widget%', 100)}
`);

// Safe identifier interpolation
const tableName = 'users';
const result = await connection.query(sql`
  SELECT * FROM ${sql.identifier(tableName)}
`);
```

---

## 5. Prepared Statements

### PreparedStatement Class

```typescript
// Prepare a statement
const stmt = await connection.prepare<{ id: number; name: string }>(
  'SELECT * FROM users WHERE id = @id AND name = @name'
);

try {
  // Execute multiple times with different parameters
  const result1 = await stmt.execute({ id: 1, name: 'Alice' });
  const result2 = await stmt.execute({ id: 2, name: 'Bob' });

  console.log(result1.rows);
  console.log(result2.rows);
} finally {
  // Always release resources
  await stmt.unprepare();
}

// Or use `using` for automatic cleanup (TC39 proposal)
{
  using stmt = await connection.prepare('SELECT * FROM users WHERE id = @id');
  const result = await stmt.execute({ id: 1 });
}
// stmt.unprepare() called automatically
```

### PreparedStatement Interface

```typescript
interface PreparedStatement<TParams = Record<string, unknown>> {
  readonly sql: string;
  readonly handle: number;  // SQL Server handle

  execute<T = Row>(params: TParams): Promise<Result<T>>;

  unprepare(): Promise<void>;

  // For `using` statement (Symbol.dispose)
  [Symbol.asyncDispose](): Promise<void>;
}
```

### Type-Safe Prepared Statements

```typescript
// Define parameter types
interface UserSearchParams {
  minAge: number;
  maxAge: number;
  role: string;
}

// Prepare with typed parameters
const stmt = await connection.prepare<UserSearchParams>(`
  SELECT * FROM users
  WHERE age BETWEEN @minAge AND @maxAge
  AND role = @role
`);

// TypeScript ensures correct parameter names and types
const result = await stmt.execute({
  minAge: 18,
  maxAge: 65,
  role: 'employee'
});
```

---

## 6. Transactions

### Basic Transaction Usage

```typescript
const tx = await connection.beginTransaction();

try {
  await tx.query('INSERT INTO accounts (id, balance) VALUES (@id, @balance)', {
    id: 1, balance: 1000
  });

  await tx.query('UPDATE accounts SET balance = balance - 100 WHERE id = @id', {
    id: 1
  });

  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
```

### Transaction with Automatic Rollback

```typescript
// Option A: Using callback (auto-commit/rollback)
await connection.transaction(async (tx) => {
  await tx.query('INSERT INTO orders ...', params);
  await tx.query('UPDATE inventory ...', params);
  // Auto-commits on success, auto-rollbacks on error
});

// Option B: Using `using` statement
{
  using tx = await connection.beginTransaction();
  await tx.query('INSERT INTO orders ...', params);
  await tx.query('UPDATE inventory ...', params);
  await tx.commit();
  // If commit() not called and block exits, auto-rollback
}
```

### Transaction Interface

```typescript
interface Transaction {
  readonly isolationLevel: IsolationLevel;
  readonly state: 'active' | 'committed' | 'rolledBack';

  // Query execution (same API as Connection)
  query<T = Row>(sql: string, params?: QueryParams): Promise<Result<T>>;
  queryBatch(sql: string): Promise<Result>;
  execute<T = Row>(procedureName: string, params?: ProcedureParams): Promise<ProcedureResult<T>>;

  // Prepared statements within transaction
  prepare<TParams>(sql: string): Promise<PreparedStatement<TParams>>;

  // Transaction control
  commit(): Promise<void>;
  rollback(): Promise<void>;
  savepoint(name: string): Promise<Savepoint>;

  // For `using` statement
  [Symbol.asyncDispose](): Promise<void>;
}

interface Savepoint {
  rollback(): Promise<void>;
}

interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  name?: string;  // For nested transactions / savepoints
}

type IsolationLevel =
  | 'readUncommitted'
  | 'readCommitted'
  | 'repeatableRead'
  | 'serializable'
  | 'snapshot';
```

### Nested Transactions (Savepoints)

```typescript
await connection.transaction(async (tx) => {
  await tx.query('INSERT INTO parent_table ...', params);

  const savepoint = await tx.savepoint('before_children');

  try {
    await tx.query('INSERT INTO child_table ...', params);
  } catch (error) {
    await savepoint.rollback();
    // Continue with parent transaction
  }

  // Commit parent transaction
});
```

---

## 7. Bulk Operations

### Basic Bulk Insert

```typescript
const bulk = connection.bulkInsert('employees', {
  checkConstraints: true,
  fireTriggers: true
});

// Define columns
bulk.addColumn('id', 'int', { nullable: false });
bulk.addColumn('firstName', 'nvarchar', { length: 50 });
bulk.addColumn('lastName', 'nvarchar', { length: 50 });
bulk.addColumn('hireDate', 'date');

// Insert rows
const rowCount = await bulk.execute([
  { id: 1, firstName: 'John', lastName: 'Doe', hireDate: new Date() },
  { id: 2, firstName: 'Jane', lastName: 'Smith', hireDate: new Date() }
]);

console.log(`Inserted ${rowCount} rows`);
```

### Streaming Bulk Insert

```typescript
const bulk = connection.bulkInsert('logs');
bulk.addColumn('timestamp', 'datetime2');
bulk.addColumn('message', 'nvarchar', { length: 'max' });
bulk.addColumn('level', 'varchar', { length: 20 });

// Stream from async generator
async function* generateLogs() {
  for await (const logEntry of readLogFile()) {
    yield {
      timestamp: logEntry.time,
      message: logEntry.msg,
      level: logEntry.level
    };
  }
}

const rowCount = await bulk.execute(generateLogs());
```

### BulkInsert Interface

```typescript
interface BulkInsert {
  addColumn(
    name: string,
    type: SqlTypeName,
    options?: ColumnOptions
  ): this;

  execute(
    rows: Iterable<object> | AsyncIterable<object>
  ): Promise<number>;

  // Utility
  getCreateTableSql(): string;
}

interface BulkInsertOptions {
  checkConstraints?: boolean;
  fireTriggers?: boolean;
  keepNulls?: boolean;
  lockTable?: boolean;
  order?: Record<string, 'asc' | 'desc'>;
  timeout?: number;
}

interface ColumnOptions {
  nullable?: boolean;
  length?: number | 'max';
  precision?: number;
  scale?: number;
}
```

---

## 8. Stored Procedures

### Calling Stored Procedures

```typescript
// Simple procedure call
const result = await connection.execute('sp_GetUserById', {
  userId: 42
});

console.log(result.rows);
console.log(result.returnValue);  // RETURN value

// With output parameters
const result = await connection.execute<{ name: string }>('sp_GetUserInfo', {
  userId: t.int(42),
  userName: t.output(t.nvarchar('', 100)),  // Output parameter
  userRole: t.output(t.nvarchar('', 50))
});

console.log(result.outputParams.userName);
console.log(result.outputParams.userRole);
console.log(result.returnValue);
```

### ProcedureResult Interface

```typescript
interface ProcedureResult<T = Row> extends Result<T> {
  readonly returnValue: number;
  readonly outputParams: Record<string, unknown>;
}
```

### Type-Safe Procedure Calls

```typescript
// Define procedure signature
interface GetOrdersParams {
  customerId: number;
  startDate: Date;
  endDate: Date;
}

interface GetOrdersOutput {
  totalAmount: number;
  orderCount: number;
}

interface Order {
  orderId: number;
  orderDate: Date;
  amount: number;
}

// Type-safe call
const result = await connection.execute<Order, GetOrdersParams, GetOrdersOutput>(
  'sp_GetOrders',
  {
    customerId: 123,
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31')
  }
);

// All fully typed
const orders: Order[] = result.rows;
const total: number = result.outputParams.totalAmount;
const count: number = result.outputParams.orderCount;
```

---

## 9. Error Handling

### Error Hierarchy

```typescript
// Base error
class TediousError extends Error {
  code: string;
  cause?: Error;
}

// Connection errors
class ConnectionError extends TediousError {
  code: 'ECONNREFUSED' | 'ETIMEOUT' | 'ELOGIN' | 'ECONNCLOSED' | ...;
}

// Request/query errors
class RequestError extends TediousError {
  code: 'EREQUEST' | 'ETIMEOUT' | 'ECANCEL' | ...;

  // SQL Server error info (if applicable)
  serverError?: {
    number: number;
    state: number;
    class: number;
    message: string;
    procedure?: string;
    lineNumber?: number;
  };
}

// Transaction errors
class TransactionError extends TediousError {
  code: 'ENOTRANSACTION' | 'EABORT' | ...;
}

// Bulk load errors
class BulkLoadError extends TediousError {
  code: 'EBULK' | ...;
  rowIndex?: number;
}
```

### Error Handling Patterns

```typescript
import {
  ConnectionError,
  RequestError,
  TransactionError
} from 'tedious';

try {
  const result = await connection.query('SELECT * FROM users');
} catch (error) {
  if (error instanceof ConnectionError) {
    console.error('Connection lost:', error.message);
    // Attempt reconnection...
  } else if (error instanceof RequestError) {
    if (error.serverError) {
      console.error(`SQL Error ${error.serverError.number}: ${error.serverError.message}`);
      console.error(`At line ${error.serverError.lineNumber}`);
    } else {
      console.error('Request failed:', error.message);
    }
  } else {
    throw error;
  }
}
```

### Timeout Handling

```typescript
// Per-query timeout
const result = await connection.query(
  'SELECT * FROM slow_view',
  undefined,
  { timeout: 60000 }  // 60 seconds
);

// Or use AbortController
const controller = new AbortController();
setTimeout(() => controller.abort(), 30000);

try {
  const result = await connection.query(
    'SELECT * FROM slow_view',
    undefined,
    { signal: controller.signal }
  );
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Query was cancelled');
  }
}
```

---

## 10. Connection Pooling

### Pool Configuration

```typescript
import { createPool, Pool } from 'tedious';

const pool = createPool({
  // Connection config
  server: 'localhost',
  database: 'mydb',
  authentication: { type: 'sql', userName: 'sa', password: 'password' },

  // Pool options
  pool: {
    min: 2,
    max: 10,
    acquireTimeout: 30000,
    idleTimeout: 60000,
    reapInterval: 1000
  }
});

// Wait for pool to be ready (optional)
await pool.ready();
```

### Using Pooled Connections

```typescript
// Option A: Automatic connection management
const result = await pool.query('SELECT * FROM users');
// Connection automatically acquired and released

// Option B: Explicit connection checkout
const connection = await pool.acquire();
try {
  await connection.query('INSERT INTO log ...');
  await connection.query('UPDATE status ...');
} finally {
  pool.release(connection);
}

// Option C: Using callback
await pool.withConnection(async (connection) => {
  const tx = await connection.beginTransaction();
  // Use transaction...
  await tx.commit();
});
```

### Pool Interface

```typescript
interface Pool {
  // Direct query execution (auto-acquires connection)
  query<T = Row>(sql: string, params?: QueryParams): Promise<Result<T>>;
  execute<T = Row>(proc: string, params?: ProcedureParams): Promise<ProcedureResult<T>>;

  // Explicit connection management
  acquire(): Promise<PooledConnection>;
  release(connection: PooledConnection): void;

  // Callback-style
  withConnection<T>(fn: (conn: Connection) => Promise<T>): Promise<T>;

  // Transaction helper
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;

  // Lifecycle
  ready(): Promise<void>;
  close(): Promise<void>;

  // Stats
  readonly size: number;
  readonly available: number;
  readonly pending: number;
}
```

---

## 11. Complete Examples

### Example 1: Basic CRUD Operations

```typescript
import { connect, types as t } from 'tedious';

async function main() {
  const connection = await connect({
    server: 'localhost',
    database: 'myapp',
    authentication: { type: 'sql', userName: 'sa', password: 'password' }
  });

  try {
    // Create
    await connection.query(
      'INSERT INTO users (name, email) VALUES (@name, @email)',
      { name: 'Alice', email: 'alice@example.com' }
    );

    // Read
    const users = await connection.query<{ id: number; name: string; email: string }>(
      'SELECT * FROM users WHERE name LIKE @pattern',
      { pattern: 'A%' }
    );

    for (const user of users.rows) {
      console.log(`${user.id}: ${user.name} <${user.email}>`);
    }

    // Update
    const updateResult = await connection.query(
      'UPDATE users SET email = @email WHERE id = @id',
      { id: 1, email: 'newemail@example.com' }
    );
    console.log(`Updated ${updateResult.rowCount} rows`);

    // Delete
    await connection.query('DELETE FROM users WHERE id = @id', { id: 1 });

  } finally {
    await connection.close();
  }
}
```

### Example 2: Streaming Large Result Sets

```typescript
import { connect } from 'tedious';

async function exportLargeTable() {
  const connection = await connect(config);

  try {
    const result = await connection.query('SELECT * FROM large_table');

    let count = 0;
    for await (const row of result) {
      await writeToFile(row);
      count++;

      if (count % 10000 === 0) {
        console.log(`Processed ${count} rows...`);
      }
    }

    console.log(`Export complete: ${count} rows`);
  } finally {
    await connection.close();
  }
}
```

### Example 3: Transaction with Error Handling

```typescript
import { connect, TransactionError } from 'tedious';

async function transferFunds(fromAccount: number, toAccount: number, amount: number) {
  const connection = await connect(config);

  try {
    await connection.transaction(async (tx) => {
      // Check balance
      const balance = await tx.query<{ balance: number }>(
        'SELECT balance FROM accounts WHERE id = @id',
        { id: fromAccount }
      );

      if (!balance.first() || balance.first()!.balance < amount) {
        throw new Error('Insufficient funds');
      }

      // Perform transfer
      await tx.query(
        'UPDATE accounts SET balance = balance - @amount WHERE id = @id',
        { id: fromAccount, amount }
      );

      await tx.query(
        'UPDATE accounts SET balance = balance + @amount WHERE id = @id',
        { id: toAccount, amount }
      );

      // Log transaction
      await tx.query(
        'INSERT INTO transaction_log (from_id, to_id, amount, timestamp) VALUES (@from, @to, @amount, @ts)',
        { from: fromAccount, to: toAccount, amount, ts: new Date() }
      );
    });

    console.log('Transfer complete');
  } catch (error) {
    if (error instanceof TransactionError) {
      console.error('Transaction failed:', error.message);
    }
    throw error;
  } finally {
    await connection.close();
  }
}
```

### Example 4: Prepared Statement for Batch Processing

```typescript
import { connect } from 'tedious';

async function batchUpdate(updates: Array<{ id: number; value: string }>) {
  const connection = await connect(config);

  try {
    using stmt = await connection.prepare<{ id: number; value: string }>(
      'UPDATE items SET value = @value WHERE id = @id'
    );

    let successCount = 0;
    for (const update of updates) {
      try {
        await stmt.execute(update);
        successCount++;
      } catch (error) {
        console.error(`Failed to update id ${update.id}:`, error);
      }
    }

    console.log(`Updated ${successCount}/${updates.length} items`);
  } finally {
    await connection.close();
  }
}
```

### Example 5: Bulk Insert with Streaming

```typescript
import { connect } from 'tedious';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

async function importCsv(filename: string) {
  const connection = await connect(config);

  try {
    const bulk = connection.bulkInsert('imported_data', {
      checkConstraints: true,
      fireTriggers: false
    });

    bulk.addColumn('id', 'int', { nullable: false });
    bulk.addColumn('name', 'nvarchar', { length: 100 });
    bulk.addColumn('value', 'decimal', { precision: 18, scale: 2 });
    bulk.addColumn('created', 'datetime2');

    async function* parseFile() {
      const parser = createReadStream(filename).pipe(parse({ columns: true }));

      for await (const record of parser) {
        yield {
          id: parseInt(record.id),
          name: record.name,
          value: parseFloat(record.value),
          created: new Date(record.created)
        };
      }
    }

    const rowCount = await bulk.execute(parseFile());
    console.log(`Imported ${rowCount} rows from ${filename}`);
  } finally {
    await connection.close();
  }
}
```

### Example 6: Using Connection Pool

```typescript
import { createPool } from 'tedious';

const pool = createPool({
  server: 'localhost',
  database: 'myapp',
  authentication: { type: 'sql', userName: 'sa', password: 'password' },
  pool: { min: 5, max: 20 }
});

// Express.js route handler
app.get('/users/:id', async (req, res) => {
  try {
    const result = await pool.query<User>(
      'SELECT * FROM users WHERE id = @id',
      { id: parseInt(req.params.id) }
    );

    const user = result.first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await pool.close();
  process.exit(0);
});
```

---

## Design Decisions Summary

| Aspect | Recommendation | Alternatives |
|--------|---------------|--------------|
| Connection creation | Factory function `connect()` | Class constructor |
| Result iteration | Unified Result with async iteration | Separate streaming/buffered types |
| Row representation | Plain objects | Column arrays |
| Parameters | Auto-inference + explicit type helpers | Always explicit types |
| Prepared statements | Class with `using` support | Simple functions |
| Transactions | `beginTransaction()` + commit/rollback | Callback only |
| Bulk insert | Builder pattern | Single method |
| Error hierarchy | Typed error classes | Single error type with codes |
| Connection pooling | First-class Pool class | Leave to userland |

---

## Migration Path

For users migrating from the callback-based API:

1. **Connection**: Replace `new Connection()` + `connect()` callback with `await connect()`
2. **Queries**: Replace `Request` + `execSql()` + callback with `await connection.query()`
3. **Parameters**: Replace `addParameter()` calls with parameter object
4. **Results**: Replace `row` event listeners with `for await` loops or `.rows`
5. **Transactions**: Replace nested callbacks with `try/catch` around `beginTransaction()`
6. **Prepared statements**: Replace event-based pattern with `prepare()`/`execute()`/`unprepare()`

Example migration:

```typescript
// Before (callback-based)
const request = new Request('SELECT * FROM users WHERE id = @id', (err, rowCount) => {
  if (err) console.error(err);
  connection.close();
});
request.addParameter('id', TYPES.Int, 42);
request.on('row', (columns) => console.log(columns));
connection.execSql(request);

// After (Promise-based)
const result = await connection.query('SELECT * FROM users WHERE id = @id', { id: 42 });
console.log(result.rows);
await connection.close();
```
