#!/usr/bin/env bash
# Обновить app/ из исходного сайта (github.com/SAKEDA-hub/ku-portal) и заново применить
# патч для десктопа (KU_DATA_DIR, HOST, module.exports).
#   ./scripts/sync-app.sh ../ku-portal
set -euo pipefail
SRC="${1:?Укажите путь к клону ku-portal}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$ROOT/app/public" "$ROOT/app/exam-sync"
cp -r "$SRC/public" "$SRC/exam-sync" "$SRC/server.js" "$SRC/package.json" "$ROOT/app/"
mkdir -p "$ROOT/app/data" && cp "$SRC/data/ku-corpus.json.gz" "$ROOT/app/data/"
python3 - "$ROOT/app/server.js" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf8').read()
a = "const DATA = path.join(ROOT, 'data');"
b = "const CORPUS_FILE = path.join(DATA, 'ku-corpus.json.gz');"
c = "server.listen(PORT, () => console.log(`KU Portal: http://localhost:${PORT}`));"
for x in (a, b, c):
    if x not in s: sys.exit('server.js изменился — патч нужно обновить вручную: ' + x)
s = s.replace(a, "const DATA = process.env.KU_DATA_DIR || path.join(ROOT, 'data'); // KU Portal Desktop")
s = s.replace(b, "const CORPUS_FILE = path.join(ROOT, 'data', 'ku-corpus.json.gz');")
s = s.replace(c, "server.listen(PORT, process.env.HOST || undefined, () => console.log(`KU Portal: http://localhost:${server.address().port}`));\nmodule.exports = server; // KU Portal Desktop")
open(p, 'w', encoding='utf8').write(s)
PY
echo "Готово. Проверка: node --test tests/*.test.js"
