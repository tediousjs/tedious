// Compares the outcome of the compatibility checks between tedious and
// another driver with the known differences between the two. See README.md.
//
// Fails if a check failed that is not a known difference - and if a known
// difference did not show, so that the list does not outlive what it lists.
import { appendFileSync, readFileSync } from 'fs';

interface Result {
  scenario: string;
  performer: string;
  check: string;
  column: string;
  value: string;
  ok: boolean;
  message: string;
}

interface KnownDifference {
  scenario: string;
  performer: string;
  check: string;
  column: string;
  value: string;
  reason: string;
  seen: number;
}

const lines = (path: string) => readFileSync(path, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#'));

function main(other: string, resultsPath: string, knownDifferencesPath: string): boolean {
  const results: Result[] = lines(resultsPath).map((line) => {
    const [scenario, performer, check, column, value, status, message = ''] = line.split('\t');
    return { scenario, performer, check, column, value, ok: status === 'ok', message };
  });

  const knownDifferences: KnownDifference[] = lines(knownDifferencesPath).map((line) => {
    const [scenario, performer, check, column, value, reason] = line.split('\t');
    if (reason === undefined) {
      throw new Error(`${knownDifferencesPath}: a line needs a scenario, driver, check, column, value and reason: ${line}`);
    }
    return { scenario, performer, check, column, value, reason, seen: 0 };
  });

  const unexpected: Result[] = [];
  const summary = new Map<string, { checks: number, passed: number, known: number, unexpected: number }>();

  for (const result of results) {
    let counts = summary.get(result.scenario);
    if (counts === undefined) {
      summary.set(result.scenario, counts = { checks: 0, passed: 0, known: 0, unexpected: 0 });
    }
    counts.checks += 1;

    if (result.ok) {
      counts.passed += 1;
      continue;
    }

    const known = knownDifferences.find((known) => {
      return known.scenario === result.scenario && known.performer === result.performer && known.check === result.check && known.column === result.column && (known.value === '*' || known.value === result.value);
    });

    if (known !== undefined) {
      known.seen += 1;
      counts.known += 1;
    } else {
      counts.unexpected += 1;
      unexpected.push(result);
    }
  }

  // Of the scenarios that were run: a subset of them can be picked.
  const stale = knownDifferences.filter((known) => known.seen === 0 && summary.has(known.scenario));

  const reasons = new Map<string, number>();
  for (const known of knownDifferences) {
    if (known.seen > 0) {
      reasons.set(known.reason, (reasons.get(known.reason) ?? 0) + known.seen);
    }
  }

  const describe = ({ scenario, performer, check, column, value }: Result | KnownDifference) => `${scenario}: ${performer} ${check} ${column} [${value}]`;

  const output: string[] = [];
  output.push(`## Always Encrypted: tedious and ${other}`, '');
  output.push('| Scenario | Checks | Passed | Known differences | Unexpected failures |');
  output.push('| --- | ---: | ---: | ---: | ---: |');
  for (const [scenario, counts] of summary) {
    output.push(`| ${scenario} | ${counts.checks} | ${counts.passed} | ${counts.known} | ${counts.unexpected} |`);
  }

  if (unexpected.length > 0) {
    output.push('', '### Unexpected failures', '');
    for (const result of unexpected) {
      output.push(`- \`${describe(result)}\` ${result.message}`);
    }
  }

  if (stale.length > 0) {
    output.push('', '### Known differences that did not show', '', `These are listed in \`${knownDifferencesPath}\`, but the checks passed or were not made.`, '');
    for (const known of stale) {
      output.push(`- \`${describe(known)}\` ${known.reason}`);
    }
  }

  if (reasons.size > 0) {
    output.push('', '### Known differences', '');
    for (const [reason, count] of reasons) {
      output.push(`- ${count} checks: ${reason}`);
    }
  }

  if (results.length === 0) {
    output.push('', 'No checks were made.');
  }

  console.log(output.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${output.join('\n')}\n`);
  }

  return results.length > 0 && unexpected.length === 0 && stale.length === 0;
}

const [other, resultsPath, knownDifferencesPath] = process.argv.slice(2);
if (knownDifferencesPath === undefined) {
  throw new Error('usage: report.ts <other driver> <results file> <known differences file>');
}

if (!main(other, resultsPath, knownDifferencesPath)) {
  process.exitCode = 1;
}
