#!/usr/bin/env bash
# Generate a local dev RSA keypair for JWT signing.
# In PRODUCTION: load keys from your secrets manager, not from disk.
set -euo pipefail

KEYS_DIR="${1:-./keys}"
mkdir -p "$KEYS_DIR"

if [[ -f "$KEYS_DIR/private.pem" ]]; then
  echo "[gen-keys] $KEYS_DIR/private.pem already exists — skipping."
  exit 0
fi

echo "[gen-keys] Generating 2048-bit RSA keypair in $KEYS_DIR..."
openssl genrsa -out "$KEYS_DIR/private.pem" 2048
openssl rsa -in "$KEYS_DIR/private.pem" -pubout -out "$KEYS_DIR/public.pem"
chmod 600 "$KEYS_DIR/private.pem"
chmod 644 "$KEYS_DIR/public.pem"

# Ensure keys/ is in .gitignore (defensive — should already be there).
if [[ -f .gitignore ]] && ! grep -q '^keys/$' .gitignore; then
  echo "keys/" >> .gitignore
fi

echo "[gen-keys] Done. Add to .env:"
echo "  JWT_PRIVATE_KEY_PATH=$KEYS_DIR/private.pem"
echo "  JWT_PUBLIC_KEY_PATH=$KEYS_DIR/public.pem"
