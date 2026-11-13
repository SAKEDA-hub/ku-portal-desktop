#!/usr/bin/env bash
# Сохраняет build.log шага CI в ветку ci/<имя> (одна свежая запись, история не копится).
#   bash .github/push-log.sh <имя> <статус>
set -u
NAME="$1"; STATUS="${2:-unknown}"
DIR="${RUNNER_TEMP:-/tmp}/cilog-$NAME"
rm -rf "$DIR" && mkdir -p "$DIR"
if [ -f build.log ]; then tail -c 400000 build.log > "$DIR/build.log"; else echo "build.log отсутствует" > "$DIR/build.log"; fi
printf 'status=%s\nsha=%s\nrun=%s\n' "$STATUS" "${GITHUB_SHA:-}" "${GITHUB_RUN_ID:-}" > "$DIR/STATUS"
cd "$DIR" || exit 0
git init -q
git checkout -q -b log
git add -A
git -c user.name="ci" -c user.email="ci@users.noreply.github.com" commit -qm "ci $NAME: $STATUS (${GITHUB_SHA:-})"
git push -qf "https://x-access-token:${GH_PUSH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "log:refs/heads/ci/$NAME" || echo "не удалось сохранить журнал"
exit 0
