// Type-level tests for the request iteration APIs - validated by the
// project's `tsc` run. The function below is intentionally never called.

import Request from '../../src/request';

export async function typeChecks(request: Request) {
  for await (const [id, name] of request.rows<[number, string | null]>()) {
    const n: number = id;
    const s: string | null = name;
    void n; void s;
  }

  for await (const row of request.rowsAsObjects<{ id: number, name: string }>()) {
    const n: number = row.id;
    const s: string = row.name;
    void n; void s;
  }

  for await (const resultSet of request.resultSets()) {
    const colName: string = resultSet.columns[0].colName;
    void colName;

    for await (const batch of resultSet.batches<[number]>()) {
      for (const [value] of batch) {
        const n: number = value;
        void n;
      }
    }

    for await (const row of resultSet.rowsAsObjects<{ total: number }>()) {
      const n: number = row.total;
      void n;
    }
  }

  // @ts-expect-error - rows are value arrays, not objects
  for await (const row of request.rows<{ id: number }>()) {
    void row;
  }

  for await (const row of request.rows()) {
    // @ts-expect-error - untyped rows are `unknown[]`, not `any[]`
    const n: number = row[0];
    void n;
  }

  for await (const row of request.sequentialRows()) {
    const value: unknown = await row.value(0);
    const stream: AsyncIterableIterator<Buffer> | null = await row.stream(1);
    void value; void stream;
  }
}
