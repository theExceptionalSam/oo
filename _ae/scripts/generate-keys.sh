#!/usr/bin/env bash
# Generates a fresh RS256 keypair for one environment.
# Usage: ./scripts/generate-keys.sh [output-dir]   (default: ./keys)
set -euo pipefail

DIR="${1:-./keys}"
mkdir -p "$DIR"
chmod 700 "$DIR"

openssl genrsa -out "$DIR/private.pem" 2048
openssl rsa -in "$DIR/private.pem" -pubout -out "$DIR/public.pem"
chmod 600 "$DIR/private.pem"
chmod 644 "$DIR/public.pem"

echo "Generated RS256 keypair in $DIR:"
echo "  private.pem (secret — never commit; mount via Docker secret or JWT_PRIVATE_KEY_PATH)"
echo "  public.pem  (safe to distribute; verify tokens anywhere)"
