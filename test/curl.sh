#!/usr/bin/env bash
set -euo pipefail

: "${PRAGMA_URL:=https://localhost:3443/api/reader/access}"
: "${PRAGMA_READER_ID:=1}"
: "${PRAGMA_GATE_ID:=2}"
: "${PRAGMA_DIRECTION:=ENTRY}"
: "${PRAGMA_CA:=/etc/pragma/tls/reader-api.crt}"
: "${PRAGMA_TAG:?Imposta PRAGMA_TAG con l'UID della tessera da provare}"
: "${PRAGMA_TOKEN:=gk-7yY2jhOECeQH4uEAYw1HuIpLdqqnyB3tYzUbOtrU}"

curl --cacert "$PRAGMA_CA" \
  -X POST "$PRAGMA_URL" \
  -H "Authorization: Bearer $PRAGMA_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"readerId\":$PRAGMA_READER_ID,\"tag\":\"$PRAGMA_TAG\",\"gateId\":$PRAGMA_GATE_ID,\"direction\":\"$PRAGMA_DIRECTION\"}"
