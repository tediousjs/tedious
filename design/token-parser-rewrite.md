# Token parser rewrite plan

This document describes a staged rewrite of the tabular result (token stream)
parsing in tedious, focused on throughput and low, flat memory usage. It is
the implementation plan for the design worked out in a series of isolated
performance experiments; each phase is independently testable and most phases
are independently shippable.

## Empirical basis

Each candidate optimization was prototyped on its own branch (all based on the
same `master` commit) and measured with interleaved A/B runs against a local
SQL Server 2022 instance and an offline ROW token benchmark
(`benchmarks/token-parser/row-tokens.js`). Medians:

| Experiment | Offline row parsing | End-to-end queries |
|---|---|---|
| Sync-first parsing, direct dispatch (`claude/sync-token-parsing`) | +35% to +58% | **+37%** |
| Cached iconv decoders (`claude/cached-iconv-decoders`) | +13% to +46% | **+12%** (varchar-heavy) |
| Pre-bound per-column readers (`claude/admiring-albattani-ezi6kb`) | +4% to +10% | +3% to +5% |
| `Result` allocation elimination (`claude/value-parser-without-result-allocations`) | ±0% | ±0% (but −16% minor GCs) |

Key takeaways that shape this plan:

1. **Async machinery dominates.** A promise per row (async row parsers) plus a
   promise per token (`Readable.from` over an async generator) plus an
   EventEmitter hop per token cost more than all per-value allocation
   combined. The parser must be synchronous whenever data is buffered, and go
   asynchronous only to wait for more data.
2. **Per-value re-resolution of per-column constants is expensive.**
   `iconv.decode` re-canonicalizes the encoding and allocates a decoder per
   value; `readValue` re-evaluates the type switch, collation, scale and
   options per value. All of these are fixed per column and should be
   resolved once, when column metadata arrives.
3. **Short-lived allocation is nearly free; copies and retained memory are
   not.** Eliminating the per-read `Result` objects reduced minor GCs by 16%
   with no wall time change. Do not design around avoiding small nursery
   objects; design around avoiding buffer copies, re-concatenation, and
   accidentally retained packet buffers.
4. **CPU profile floor:** with overhead removed, remaining time is value
   materialization - `Date` construction, ucs2/SBCS string decoding, BigInt
   to string conversion. These have dedicated fast paths in a later phase.

## Target architecture

```
socket ──→ packet reassembly ──→ byte cursor ──→ token parser ──→ handler callbacks
           (header parse,         (contiguous      (sync loop,       (Request events /
            no Packet objects,     reusable         compiled          batched iterator
            no per-packet copy)    buffer,          per-column        at the API edge)
                                   sync reads,      readers)
                                   async refill)
```

- Exactly one async boundary: the cursor's refill, awaited when buffered data
  runs out, when a genuinely streaming token parser is hit, or when paused.
- Parsing model: *sync-first with restart-on-underrun*. Parsers read
  optimistically from the buffered data and throw `NotEnoughDataError` when
  it runs out; the caller restores the position, awaits more data, and
  re-parses. No resumable state machines.
- Per result set, COLMETADATA compiles a row reader: one closure per column
  with type dispatch, codepage decoder, scale divisor and options resolved
  up front.
- Streams only at the API edges, never between the socket and the parser.

## Phases

### Phase 0 - Benchmarks and verification harness

- `benchmarks/token-parser/row-tokens.js`: offline ROW parsing benchmark with
  `narrow`, `wide` and `chars` schemas (synthesized COLMETADATA + ROW + DONE
  streams).
- Verification approach for every phase: feed identical token streams at
  multiple chunk sizes (whole buffer, 7 bytes, 3 bytes) and assert
  byte-identical parsed values - tiny chunks force the slow/async paths at
  every possible boundary, including PLP null / multi-chunk / unknown-length
  values. Plus the unit suite, the full integration suite against a real
  SQL Server, and the dedicated pause/resume integration tests.

### Phase 1 - Sync-first parsing, direct dispatch (port from `claude/sync-token-parsing`)

- `rowParser` / `nbcRowParser` attempt to parse the complete row
  synchronously (including PLP values via `readPLPStreamSync`), falling back
  to the incremental async implementation only when the row crosses a chunk
  boundary. Parser position is committed only on success.
- `token-stream-parser` drives the parse loop itself and dispatches tokens to
  the handler directly: no `Readable.from`, no `'data'` events.
  `pause()`/`resume()` are implemented as a promise gate checked before each
  token dispatch.
- `StreamParser.parseTokens` is kept unchanged for API compatibility.

### Phase 2 - Cached encoding decoders (port from `claude/cached-iconv-decoders`)

- `src/iconv-helpers.ts`: `decode(buf, encoding)` caches one decoder instance
  per encoding and reuses it via `write()` + `end()`. Safe because decoding
  is synchronous and `end()` resets stateful (DBCS) decoders; SBCS decoders
  are stateless. Unit tests assert byte-identical output vs `iconv.decode`
  for all collation codepages and that no state leaks between calls.

### Phase 3 - Compiled per-column readers

- `buildValueReader(metadata, options)`: returns a `(buf, offset) => Result`
  closure per column with all per-column decisions hoisted out of the
  per-value path - numeric type dispatch, codepage → cached decoder instance,
  `10^scale` divisor for numeric/decimal, `useUTC`/`lowerCaseGuids`.
  Returns `null` for PLP-streamed columns.
- `buildPLPDecoder(metadata, options)`: pre-bound chunks → value conversion
  for PLP columns (ucs2 / codepage decode / concat).
- Both are lazily built and memoized on the column metadata, so externally
  supplied `colMetadata` (public `parseTokens` API) keeps working.
- The sync and async row parsers consume the compiled readers; `readValue`
  remains as the uncompiled path for RETURNVALUE tokens.

### Phase 4 - Contiguous reusable read buffer

Replace the `waitForChunk` re-concatenation (O(n²) for values spanning many
chunks) and the `bl` + slice copies with a single growable, reusable buffer:

- Incoming chunks are appended into a preallocated buffer; the parser reads
  at `position`; consumed space is reclaimed by compacting the (small)
  unconsumed remainder to the front when the buffer would otherwise grow.
- Steady-state memory: ~one packet plus one partial row, independent of
  result set size.
- **Required consequence:** every `Buffer` value handed out (varbinary, UDT,
  binary) must be copied out instead of sliced, since slices would alias the
  reusable buffer. This also fixes today's hidden retention issue where a
  small `slice()` value pins its entire packet buffer.
- PLP values: feed chunks incrementally into the cached stateful decoder
  (`write()` per chunk, `end()` at the value boundary) instead of
  `Buffer.concat`-ing the whole value, so large values never exist twice.

### Phase 5 - Flatten the packet/message layer

- Parse the 8-byte packet headers directly where data enters (replacing
  `IncomingMessageStream` + per-message `Message` PassThrough + `Packet`
  instances on the read path) and append payload bytes straight into the
  Phase 4 buffer.
- Backpressure: stop reading from the socket while the parser is paused or
  while the buffered, unparsed data exceeds a threshold.
- Debug packet logging becomes lazy (only when a debug listener is attached).

### Phase 6 - Value materialization fast paths ⬜

- Dates (UTC path): `new Date(EPOCH_MS + days * 86400000 + ms)` from
  precomputed epoch constants instead of `Date.UTC(year, month, day, ...)`
  calendar math per value.
- SBCS strings: all SQL Server codepages are ASCII-transparent below 0x80; a
  high-bit scan lets pure-ASCII values use native `toString('latin1')`,
  falling back to the cached iconv decoder otherwise.
- Optional `bigint` return mode to skip the per-value `toString()`.

### Phase 7 - Row shape and consumption API

Implemented as an opt-in `rowFormat` connection option (`'columns'`, the
default, is today's shape; `'values'` is the new one), so that the suite and
downstream consumers keep working unchanged - flipping the default to
`'values'` is the actual breaking change and is left to the next major
version:

- `rowFormat: 'values'` emits rows as a plain values array (or, with
  `useColumnNames`, a name keyed map of values built from a name lookup
  precomputed once per result set).
- ROW/NBCROW tokens are dispatched to the handler directly in both formats,
  without allocating a `RowToken` per row.
- `request.batches()`: an async iterable yielding one array of rows per
  parsing burst, with pause/resume based backpressure, so iterator consumers
  do not pay a promise per row.

## Non-goals

- No `new Function` code generation for row readers: measured dispatch cost
  is already near the floor (~12ns per megamorphic call vs ~240ns of real
  decode work per cell), and codegen breaks CSP environments.
- No worker-thread or native-addon parsing: values would have to cross the
  thread boundary (structured clone re-pays materialization), and the hot
  byte work already runs in native code.
- No public API changes before Phase 7.

## Measured results (phases 1-3 combined)

Interleaved A/B medians against `master`, measured on this branch:

- offline row parsing: narrow schema ~2.0x, wide schema ~1.8x,
  varchar-heavy schema ~2.1x
- end-to-end sequential queries against SQL Server 2022:
  1000 rows x 3 columns (incl. nvarchar(max)): ~+37%
  1000 rows x 4 varchar columns: ~+44%

Phase 4: row parsing throughput unchanged; parsing a 64MB PLP value is
~20% faster at the median with a much tighter tail (max 428ms vs 953ms),
since the per-refill allocation churn (and its GC spikes) is gone.

Phase 5: end-to-end row workloads unchanged; bulk transfer throughput
(repeated 6MB nvarchar(max) values) improves by ~10-20%.

Phase 7: `rowFormat: 'values'` vs `'columns'`: offline row parsing +18%
(narrow), +8% (wide), +4% (varchar-heavy); end-to-end 1000-row queries
~+9%. The `'columns'` format is unchanged to slightly faster (~+3%).

## Status

| Phase | Status |
|---|---|
| 0 - Benchmarks and verification harness | ✅ done |
| 1 - Sync-first parsing, direct dispatch | ✅ done |
| 2 - Cached encoding decoders | ✅ done |
| 3 - Compiled per-column readers | ✅ done |
| 4 - Contiguous reusable read buffer | ✅ done |
| 5 - Flatten the packet/message layer | ✅ done |
| 6 - Value materialization fast paths | ⬜ planned |
| 7 - Row shape and consumption API | ✅ done (default flip pending major version) |
