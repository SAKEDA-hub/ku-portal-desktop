#!/usr/bin/env bash
# Автопроверка APK на эмуляторе Android (CI, reactivecircus/android-emulator-runner).
# Важно: всё, что запускается в фоне, пишет в файлы и останавливается в конце — иначе шаг CI
# ждёт закрытия вывода и не завершается.
set -uo pipefail
OUT=smoke-out; mkdir -p "$OUT"
APK=mobile/android/app/build/outputs/apk/debug/app-debug.apk

# копия сайта для эмулятора: из эмулятора компьютер виден как 10.0.2.2
D=$(mktemp -d); cp -r app/. "$D"/
( cd "$D" && PORT=3000 LM_STUDIO_URL=http://127.0.0.1:9 DEMO=1 exec node server.js ) > "$OUT/site.log" 2>&1 < /dev/null &
SITE=$!
sleep 2

{
  adb wait-for-device
  adb shell getprop ro.build.version.release | sed 's/^/Android /' > "$OUT/device.txt"
  adb shell dumpsys package com.google.android.webview | grep -m1 versionName | sed 's/^ */WebView /' >> "$OUT/device.txt"
  cat "$OUT/device.txt"
  adb install -r "$APK"
  adb logcat -c
  adb shell am start -W -n kz.ku.portal/.MainActivity
} < /dev/null 2>&1 | tee -a build.log
sleep 8
adb exec-out screencap -p > "$OUT/android-00-start.png" < /dev/null

KU_SMOKE_DATA_DIR="$D/data/demo" node tests/smoke/android-smoke.js < /dev/null 2>&1 | tee -a build.log
RC=${PIPESTATUS[0]}

adb logcat -d -v time > "$OUT/logcat.txt" 2>&1 < /dev/null || true
adb forward --remove-all < /dev/null > /dev/null 2>&1 || true
kill "$SITE" 2>/dev/null || true
wait "$SITE" 2>/dev/null || true
echo "android-smoke: код $RC"
exit "$RC"
