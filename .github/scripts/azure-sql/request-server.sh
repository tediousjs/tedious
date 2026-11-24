#!/usr/bin/env bash
# Test job (untrusted side): creates a one-time key pair and writes the
# request the provisioning workflow reads: this runner's IP (for the server
# firewall) and the public key to encrypt the credentials to.
set -euo pipefail

dir="$RUNNER_TEMP/azure-sql"
mkdir -p "$dir/request"

(umask 077 && openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$dir/key.pem" 2>/dev/null)
runner_ip=$(curl -sSf --retry 3 https://api.ipify.org)

jq -n --arg ip "$runner_ip" --arg key "$(openssl pkey -in "$dir/key.pem" -pubout)" \
  '{ip: $ip, public_key: $key}' > "$dir/request/request.json"
