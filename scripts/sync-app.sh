#!/usr/bin/env bash
# Обновить app/ из сайта (клон github.com/SAKEDA-hub/ku-portal). Код копируется без изменений.
#   ./scripts/sync-app.sh ../ku-portal
set -euo pipefail
SRC="${1:?Укажите путь к клону ku-portal}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$ROOT/app/public" "$ROOT/app/exam-sync"
cp -r "$SRC/public" "$SRC/exam-sync" "$SRC/server.js" "$SRC/package.json" "$ROOT/app/"
mkdir -p "$ROOT/app/data" && cp "$SRC/data/ku-corpus.json.gz" "$ROOT/app/data/"
echo "Готово. Проверка: node --test tests/*.test.js"
