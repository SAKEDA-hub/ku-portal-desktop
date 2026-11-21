#!/usr/bin/env bash
# Обновить app/ из сайта (клон github.com/SAKEDA-hub/ku-portal). Код копируется без изменений.
# Встроенному серверу нужны все backend-модули и приложения, а не только server.js.
#   ./scripts/sync-app.sh ../ku-portal
set -euo pipefail
SRC="${1:?Укажите путь к клону ku-portal}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for dir in public exam-sync server ku-message results admin; do
  rm -rf "$ROOT/app/$dir"
  cp -r "$SRC/$dir" "$ROOT/app/$dir"
done
cp "$SRC/server.js" "$SRC/package.json" "$ROOT/app/"
mkdir -p "$ROOT/app/data" && cp "$SRC/data/ku-corpus.json.gz" "$ROOT/app/data/"
echo "Готово. Проверка: node --test tests/*.test.js"
