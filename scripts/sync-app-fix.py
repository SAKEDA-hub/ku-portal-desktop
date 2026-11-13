#!/usr/bin/env python3
"""Скопировать desktop/ui/app-fix.css в mobile/.../assets/bridge.js (APP_FIX_CSS)."""
import json, os, re
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
css = open(os.path.join(root, 'desktop/ui/app-fix.css'), encoding='utf8').read()
p = os.path.join(root, 'mobile/android/app/src/main/assets/bridge.js')
s = open(p, encoding='utf8').read()
s = re.sub(r'var APP_FIX_CSS = ".*?";\n', lambda m: 'var APP_FIX_CSS = ' + json.dumps(css, ensure_ascii=False) + ';\n', s, flags=re.S)
open(p, 'w', encoding='utf8').write(s)
print('bridge.js обновлён')
