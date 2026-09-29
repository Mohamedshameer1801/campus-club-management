#!/usr/bin/env bash
# Exports every legacy PostgreSQL table to JSON-lines so no pre-SQLite data is lost.
# Usage: PG_URL=postgresql://user:pass@host:5432/db ./scripts/export-legacy-postgres.sh
set -euo pipefail
PG_URL="${PG_URL:-postgresql://postgres:postgres@127.0.0.1:5432/app_db}"
OUT="data/legacy-postgres-export"; mkdir -p "$OUT"
for t in users students faculty_profiles clubs dynamic_roles club_memberships timetable_structures timetable_periods events event_registrations on_duty_requests certificates badges student_badges notifications messages audit_logs qr_tokens; do
  psql "$PG_URL" -tAc "select row_to_json(t) from $t t" > "$OUT/$t.jsonl"
  echo "$t: $(wc -l < "$OUT/$t.jsonl") rows"
done
