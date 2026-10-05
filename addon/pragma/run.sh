#!/usr/bin/env bash
set -euo pipefail

OPTIONS=/data/options.json
PRAGMA_USERNAME="$(jq -er '.username | strings | select(length > 0)' "$OPTIONS")" || {
  echo "Configura un nome utente amministratore." >&2
  exit 1
}
PRAGMA_PASSWORD="$(jq -er '.password | strings' "$OPTIONS")" || {
  echo "La password amministratore deve contenere almeno 12 caratteri." >&2
  exit 1
}
if (( ${#PRAGMA_PASSWORD} < 12 )); then
  echo "La password amministratore deve contenere almeno 12 caratteri." >&2
  exit 1
fi
export PRAGMA_USERNAME PRAGMA_PASSWORD

export HOST=0.0.0.0
export PORT=3000
export PRAGMA_DATA_DIR=/data
export INGRESS_ONLY=true
export HOME_ASSISTANT_URL=http://supervisor/core
export HOME_ASSISTANT_TOKEN="${SUPERVISOR_TOKEN:?SUPERVISOR_TOKEN non disponibile: abilita homeassistant_api in config.yaml}"

if [[ "$(jq -r '.reader_api_enabled // false' "$OPTIONS")" == "true" ]]; then
  export TLS_CERT_FILE="$(jq -er '.tls_cert_file | strings | select(length > 0)' "$OPTIONS")"
  export TLS_KEY_FILE="$(jq -er '.tls_key_file | strings | select(length > 0)' "$OPTIONS")"
  if [[ ! -r "$TLS_CERT_FILE" || ! -r "$TLS_KEY_FILE" ]]; then
    echo "Certificato o chiave TLS non leggibili. Verifica i percorsi nella configurazione Pragma." >&2
    exit 1
  fi
  export READER_API_HOST=0.0.0.0
  export READER_API_PORT=3443
fi

exec node /opt/pragma/server.js
