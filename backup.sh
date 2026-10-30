#!/usr/bin/env bash
# Бэкап базы и кода. Запускать на сервере: bash backup.sh
set -euo pipefail

OUT=/tmp/fearbackup
rm -rf "$OUT" && mkdir -p "$OUT"

need_pg() {
  command -v pg_dump >/dev/null 2>&1 || return 0
  local v
  v=$(pg_dump --version | grep -oE '[0-9]+' | head -1)
  [ "${v:-0}" -ge 17 ] && return 1 || return 0
}
if need_pg; then
  echo "Ставлю postgresql-client-17 (Supabase на PG 17)..."
  apt-get update -y >/dev/null 2>&1 || true
  apt-get install -y wget gnupg lsb-release >/dev/null 2>&1 || true
  install -d /usr/share/keyrings
  wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg
  echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y >/dev/null 2>&1
  apt-get install -y postgresql-client-17 >/dev/null 2>&1
fi
PGDUMP=$(ls /usr/lib/postgresql/*/bin/pg_dump 2>/dev/null | sort -V | tail -1)
PGDUMP=${PGDUMP:-pg_dump}

DU=$(grep '^DIRECT_URL=' /opt/justland/gd-server/.env | cut -d= -f2- | tr -d '"')
if [ -z "$DU" ]; then
  echo "DIRECT_URL не найден в /opt/justland/gd-server/.env" >&2
  exit 1
fi
# sslmode дописываем как параметр: через '?' только если строки запроса ещё нет,
# иначе получалось '...?pgbouncer=true?sslmode=require' и подключение падало.
case "$DU" in
  *sslmode=*)  ;;
  *\?*)        DU="$DU&sslmode=require" ;;
  *)           DU="$DU?sslmode=require" ;;
esac

echo "Дамп базы данных..."
# pipefail выше обязателен: без него падение pg_dump оставалось незамеченным
# и рядом ложился пустой db.sql.gz с отчётом "Готово".
"$PGDUMP" "$DU" --no-owner --no-acl --schema=public | gzip -9 > "$OUT/db.sql.gz"

# Пустой дамп — это тоже провал, даже если код возврата нулевой.
if [ ! -s "$OUT/db.sql.gz" ] || [ "$(stat -c%s "$OUT/db.sql.gz")" -lt 1024 ]; then
  echo "Дамп получился подозрительно маленьким — бэкап не считается успешным" >&2
  exit 1
fi

echo "Архив кода сервера..."
tar -czf "$OUT/code.tar.gz" \
  --exclude='node_modules' --exclude='.next' --exclude='.git' --exclude='backups' \
  -C /opt justland

echo "Готово:"
ls -lh "$OUT"
