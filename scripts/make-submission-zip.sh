#!/usr/bin/env bash
# Builds the submission archive from COMMITTED files only and refuses to produce it if anything sensitive slipped in.
# Usage: scripts/make-submission-zip.sh [output.zip]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-campus-club-platform.zip}"
TMP=""
trap 'rc=$?; [ -n "$TMP" ] && rm -rf "$TMP"; [ $rc -ne 0 ] && rm -f "$OUT"; exit $rc' EXIT

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: uncommitted changes present. Commit first - the archive is built from HEAD." >&2
  exit 1
fi

rm -f "$OUT"
git archive --format=zip --prefix=campus-club-platform/ -o "$OUT" HEAD
LIST="$(unzip -Z1 "$OUT")"

if echo "$LIST" | grep -E '(^|/)\.env($|\.)' | grep -v -E '\.env\.example$'; then
  echo "ERROR: an .env file is inside the archive" >&2; rm -f "$OUT"; exit 1
fi
if echo "$LIST" | grep -E '\.(db|db-wal|db-shm|sqlite)$|node_modules/|legacy-postgres-export|\.next/'; then
  echo "ERROR: forbidden file(s) inside the archive" >&2; rm -f "$OUT"; exit 1
fi

TMP="$(mktemp -d)"
unzip -q "$OUT" -d "$TMP"
if grep -rIE --exclude='make-submission-zip.sh' 'GOCSPX-|AIza[0-9A-Za-z_-]{30}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|sk-[A-Za-z0-9]{32,}|client_secret"\s*:' "$TMP"; then
  echo "ERROR: something that looks like a credential is inside the archive" >&2; rm -f "$OUT"; exit 1
fi

echo "OK: $OUT created ($(echo "$LIST" | wc -l | tr -d ' ') files, no .env, no database files, no credential patterns)."
