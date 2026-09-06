'use strict';

// Runs every benchmark in this directory against all supported drivers and
// prints a side-by-side comparison table.
//
// Usage:
//
//   node benchmarks/compare/run.js [benchmark ...] [key=value ...]
//
// Positional arguments select which benchmark files to run (e.g.
// `select-many-rows`); `key=value` arguments are forwarded to the benchmarks
// and override their configuration (e.g. `n=10 size=100` for a quick run, or
// `driver=tedious` to run a single driver).

const path = require('path');
const fs = require('fs');
const child_process = require('child_process');

const { formatBytes } = require('../common');
const { DRIVERS } = require('../drivers');

const args = process.argv.slice(2);
const overrides = args.filter((arg) => arg.includes('='));
const selected = args.filter((arg) => !arg.includes('='));

const benchmarks = fs.readdirSync(__dirname)
  .filter((file) => file.endsWith('.js') && file !== 'run.js')
  .map((file) => file.slice(0, -3))
  .filter((name) => selected.length === 0 || selected.includes(name))
  .sort();

if (benchmarks.length === 0) {
  console.error(`No benchmarks matched: ${selected.join(', ')}`);
  process.exit(1);
}

const results = [];

function runBenchmark(name, callback) {
  const file = path.join(__dirname, `${name}.js`);
  console.error(`Running ${name}...`);

  const child = child_process.fork(file, overrides, { stdio: 'inherit' });

  child.on('message', (message) => {
    if (message.type === 'report') {
      results.push(message);
    }
  });

  child.on('close', (code) => {
    if (code) {
      console.error(`${name} exited with code ${code}`);
    }

    callback();
  });
}

function formatRate(rate) {
  if (rate === undefined) {
    return 'n/a';
  }

  return rate.toLocaleString('en-US', { maximumFractionDigits: rate < 100 ? 2 : 0 });
}

function formatTable(rows) {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  const line = (row) => `| ${row.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
  const separator = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;

  return [line(rows[0]), separator, ...rows.slice(1).map(line)].join('\n');
}

function printResults() {
  // Group results by benchmark name + configuration (minus the driver).
  const groups = new Map();

  for (const result of results) {
    const conf = Object.assign({}, result.conf);
    const driver = conf.driver;
    delete conf.driver;

    const confString = Object.keys(conf).map((key) => `${key}=${conf[key]}`).join(' ');
    const key = `${result.name} ${confString}`;

    if (!groups.has(key)) {
      groups.set(key, {
        name: result.name.replace(/^compare\//, '').replace(/\.js$/, ''),
        conf: confString,
        rates: {},
        gc: {},
        memory: {}
      });
    }

    const group = groups.get(key);
    group.rates[driver] = result.rate;
    group.gc[driver] = summarizeGc(result.gcStats);
    group.memory[driver] = result.memoryStats;
  }

  const drivers = DRIVERS.filter((driver) => results.some((result) => result.conf.driver === driver));

  const header = ['benchmark', 'config', ...drivers.map((driver) => `${driver} (ops/s)`)];
  if (drivers.length === 2) {
    header.push(`${drivers[0]} / ${drivers[1]}`);
  }

  const rows = [header];

  for (const group of groups.values()) {
    const row = [group.name, group.conf, ...drivers.map((driver) => formatRate(group.rates[driver]))];

    if (drivers.length === 2) {
      const a = group.rates[drivers[0]];
      const b = group.rates[drivers[1]];
      row.push(a !== undefined && b !== undefined ? `${(a / b).toFixed(2)}x` : 'n/a');
    }

    rows.push(row);
  }

  console.log();
  console.log('## Throughput');
  console.log();
  console.log(formatTable(rows));

  if (drivers.length === 2) {
    console.log();
    console.log(`Values > 1.00x mean ${drivers[0]} performed more operations per second than ${drivers[1]}.`);
  }

  printGcAndMemory(groups, drivers);
}

function summarizeGc(gcStats) {
  let count = 0;
  let duration = 0;

  for (const kind of Object.keys(gcStats)) {
    count += gcStats[kind].count;
    duration += gcStats[kind].totalDuration;
  }

  return { count, duration };
}

function formatGc(gc) {
  if (!gc) {
    return 'n/a';
  }

  return `${gc.count} / ${gc.duration.toFixed(1)}ms`;
}

function formatMemory(memory, key) {
  if (!memory) {
    return 'n/a';
  }

  return formatBytes(memory.peak[key]);
}

function printGcAndMemory(groups, drivers) {
  const header = ['benchmark', 'config'];
  for (const driver of drivers) {
    header.push(`${driver} gc (count / pause)`);
  }
  for (const driver of drivers) {
    header.push(`${driver} peak rss`);
  }
  for (const driver of drivers) {
    header.push(`${driver} peak heap`);
  }
  for (const driver of drivers) {
    header.push(`${driver} peak external`);
  }

  const rows = [header];

  for (const group of groups.values()) {
    rows.push([
      group.name,
      group.conf,
      ...drivers.map((driver) => formatGc(group.gc[driver])),
      ...drivers.map((driver) => formatMemory(group.memory[driver], 'rss')),
      ...drivers.map((driver) => formatMemory(group.memory[driver], 'heapUsed')),
      ...drivers.map((driver) => formatMemory(group.memory[driver], 'external'))
    ]);
  }

  console.log();
  console.log('## GC and memory');
  console.log();
  console.log(formatTable(rows));
  console.log();
  console.log('GC shows the number of collections and total pause time during the measured window.');
  console.log('Memory shows the peak values sampled during the measured window. Native allocations');
  console.log('(e.g. ODBC buffers) are not visible on the V8 heap but are included in the resident set size.');
}

(function next(i) {
  if (i === benchmarks.length) {
    if (results.length === 0) {
      console.error('No results were collected.');
      process.exit(1);
    }

    printResults();
    return;
  }

  runBenchmark(benchmarks[i], () => next(i + 1));
})(0);
