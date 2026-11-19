#!/usr/bin/env bash
# Runs the unit tests, then the integration tests once per TDS version, with
# whichever Node.js version is on PATH. Expects `npm ci` to have run and
# test/config.ts to be in place.
#
# Each pass writes its lcov report to its own directory under coverage/, for a
# single Codecov upload afterwards. Every pass runs even if an earlier one
# fails, so one run reports all failures; the script exits non-zero at the end
# if any pass failed.
set -uo pipefail

rm -rf coverage

node_version=$(node --version)
failed=()

# run <name> <report dir> <npm script> [VAR=value...]
run() {
  local name=$1 dir=$2 script=$3
  shift 3

  echo "::group::$name (Node.js $node_version)"
  env "$@" npx nyc --reporter=lcov --report-dir "coverage/$dir" npm run "$script"
  local status=$?
  echo "::endgroup::"

  if [ "$status" -ne 0 ]; then
    echo "::error::$name failed on Node.js $node_version"
    failed+=("$name")
  fi
}

run "unit tests" unit test

for tds in 7_4 7_3_B 7_3_A 7_2 7_1; do
  run "integration tests (TDS $tds)" "integration-$tds" test-integration "TEDIOUS_TDS_VERSION=$tds"
done

if [ "${#failed[@]}" -ne 0 ]; then
  echo "Failed on Node.js $node_version: ${failed[*]}"
  exit 1
fi
