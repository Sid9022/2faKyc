#!/usr/bin/env bash
# Generates a self-signed dev cert that covers localhost, 127.0.0.1 and the
# machine's LAN IP(s), so the Vite dev server can serve HTTPS on every
# address the user might hit. Browsers will warn "not secure" the first time
# per origin; the user clicks "Advanced -> Proceed" once and the permission
# prompt (camera/mic/location) starts appearing.
#
# Usage: bash scripts/generate-dev-cert.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/.dev-certs"
KEY_FILE="$CERT_DIR/key.pem"
CERT_FILE="$CERT_DIR/cert.pem"
CONF_FILE="$CERT_DIR/san.cnf"

mkdir -p "$CERT_DIR"

# Build the list of Subject Alternative Names: localhost, 127.0.0.1, ::1,
# and every non-loopback IPv4 we can find.
SAN_ENTRIES=("DNS:localhost" "IP:127.0.0.1" "IP:0:0:0:0:0:0:0:1")
LAN_IPS=$(ip -4 -o addr show scope global 2>/dev/null \
  | awk '{print $4}' \
  | cut -d/ -f1 \
  | grep -v '^127\.' \
  | grep -v '^$' \
  | sort -u || true)

if [ -n "${LAN_IPS}" ]; then
  while IFS= read -r ip; do
    SAN_ENTRIES+=("IP:${ip}")
  done <<< "${LAN_IPS}"
fi

SAN_LINE="subjectAltName = $(IFS=, ; echo "${SAN_ENTRIES[*]}")"

cat > "$CONF_FILE" <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
CN = 2FA-KYC local dev

[v3_req]
basicConstraints     = CA:FALSE
keyUsage             = digitalSignature, keyEncipherment
extendedKeyUsage     = serverAuth
${SAN_LINE}
EOF

# 1 day is enough for a dev session; the user can re-run this anytime.
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$KEY_FILE" \
  -out    "$CERT_FILE" \
  -days   365 \
  -config "$CONF_FILE" \
  2>/dev/null

echo ""
echo "Generated dev cert:"
echo "  key : $KEY_FILE"
echo "  cert: $CERT_FILE"
echo "  SAN : ${SAN_ENTRIES[*]}"
echo ""
if [ -n "${LAN_IPS}" ]; then
  echo "Detected LAN IPs: $(echo "${LAN_IPS}" | tr '\n' ' ')"
  echo "First-time browser warning: 'Your connection is not private'."
  echo "Click 'Advanced' -> 'Proceed to <ip> (unsafe)' once per browser to accept."
  echo ""
fi
echo "Now run: npm run dev:https"
