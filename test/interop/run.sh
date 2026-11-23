#!/usr/bin/env bash
# Checks that tedious and another driver read what the other one encrypted
# with Always Encrypted. See README.md.
#
#   test/interop/run.sh <jdbc|sqlclient> [scenario...]
set -euo pipefail

other=${1:-}
if [[ $other != jdbc && $other != sqlclient ]]; then
  echo "usage: $0 <jdbc|sqlclient> [scenario...]" >&2
  exit 2
fi
shift

# The name of a scenario, the collation of its database, and the charset that
# the JVM is run with: Microsoft's JDBC driver encodes `varchar` values with
# the default charset of the JVM, which has to be that of the database.
scenarios=(
  "default  SQL_Latin1_General_CP1_CI_AS     windows-1252"
  "cyrillic Cyrillic_General_CI_AS           windows-1251"
  "japanese Japanese_CI_AS                   windows-31j"
  "utf8     Latin1_General_100_CI_AS_SC_UTF8 UTF-8"
)

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
work=$here/.work/$other
rm -rf "$work"
mkdir -p "$work"

# Times of the specs are in UTC.
export TZ=UTC

export INTEROP_OTHER=$other
export INTEROP_RESULTS=$work/results.tsv

# How the other driver connects: to the server of test/config.ci.ts, which is
# the one of test/docker-compose.linux.yml. tedious connects as test/config.ts
# says.
export INTEROP_HOST=${INTEROP_HOST:-localhost}
export INTEROP_PORT=${INTEROP_PORT:-1433}
export INTEROP_USER=${INTEROP_USER:-sa}
export INTEROP_PASSWORD=${INTEROP_PASSWORD:-yourStrong(!)Password}

cd "$here/../.."
tedious() { node -r ./test/setup.js test/interop/tedious.ts "$@"; }

# The column master key: an RSA key that both drivers are given, as a PEM
# file and as a PKCS #12 key store.
export INTEROP_KEY=$work/key.pem
export INTEROP_KEYSTORE=$work/keystore.p12
export INTEROP_KEYSTORE_SECRET=interop-secret
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=tedious interop' -keyout "$INTEROP_KEY" -out "$work/cert.pem" 2> /dev/null
openssl pkcs12 -export -name interop -inkey "$INTEROP_KEY" -in "$work/cert.pem" -passout "pass:$INTEROP_KEYSTORE_SECRET" -out "$INTEROP_KEYSTORE"

echo "::group::build"
case $other in
  jdbc)
    mvn --version
    mvn --quiet --batch-mode --file test/interop/jdbc/pom.xml dependency:copy-dependencies "-DoutputDirectory=$work/lib"
    javac -d "$work/classes" -cp "$work/lib/*" test/interop/jdbc/Interop.java
    driver() { java -Duser.timezone=UTC "-Dfile.encoding=$charset" -cp "$work/classes:$work/lib/*" Interop "$@"; }

    # A column encryption key that the key store provider of the JDBC driver encrypted.
    export INTEROP_OTHER_CEK=$work/cek.hex
    charset=UTF-8 driver wrap > "$INTEROP_OTHER_CEK"
    ;;

  sqlclient)
    export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
    dotnet --version
    dotnet build test/interop/sqlclient --configuration Release --artifacts-path "$work/artifacts" --nologo --verbosity quiet
    driver() { dotnet "$work/artifacts/bin/Interop/release/Interop.dll" "$@"; }
    ;;
esac
echo "::endgroup::"

tedious wait

for scenario in "${scenarios[@]}"; do
  read -r name collation charset <<< "$scenario"
  if (( $# > 0 )) && [[ " $* " != *" $name "* ]]; then
    continue
  fi

  echo "::group::$name"
  export INTEROP_SCENARIO=$name
  export INTEROP_SPEC=$here/specs/$name.tsv
  export INTEROP_DATABASE=tedious_interop_$name
  export INTEROP_COLLATION=$collation

  tedious createdb
  tedious setup

  # Each driver writes the values of the spec, and then reads what the other
  # one wrote.
  driver write
  tedious write
  tedious verify
  driver verify

  tedious dropdb
  echo "::endgroup::"
done

node -r ./test/setup.js test/interop/report.ts "$other" "$INTEROP_RESULTS" "test/interop/$other/known-differences.tsv"
