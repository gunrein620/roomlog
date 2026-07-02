#!/usr/bin/env bash
set -euo pipefail

TEST_DB="${POSTGRES_TEST_DB:-roomlog_test}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=test_db="$TEST_DB" \
  --set=postgres_user="$POSTGRES_USER" <<'EOSQL'
SELECT 'CREATE DATABASE ' || quote_ident(:'test_db') || ' OWNER ' || quote_ident(:'postgres_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'test_db')\gexec
EOSQL
