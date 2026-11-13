#!/usr/bin/env bash
# Автопроверка APK на эмуляторе Android (CI, reactivecircus/android-emulator-runner).
set -uo pipefail
OUT=smoke-out; mkdir -p "$OUT"
exec > >(tee -a build.log) 2>&1
APK=mobile/android/app/build/outputs/apk/debug/app-debug.apk

# копия сайта для эмулятора: из эмулятора компьютер виден как 10.0.2.2
D=$(mktemp -d); cp -r app/. "$D"/
(cd "$D" && PORT=3000 LM_STUDIO_URL=http://127.0.0.1:9 nohup node server.js > "$OLDPWD/$OUT/site.log" 2>&1 &)
sleep 2

adb wait-for-device
adb shell getprop ro.build.version.release | sed 's/^/Android /' | tee "$OUT/device.txt"
adb shell dumpsys package com.google.android.webview | grep -m1 versionName | sed 's/^ */WebView /' | tee -a "$OUT/device.txt"
adb install -r "$APK" || exit 1
adb logcat -c
adb shell am start -W -n kz.ku.portal/.MainActivity
sleep 8
adb exec-out screencap -p > "$OUT/android-00-start.png"

node tests/smoke/android-smoke.js; RC=$?
adb logcat -d -v time > "$OUT/logcat.txt" 2>&1 || true
exit $RC
