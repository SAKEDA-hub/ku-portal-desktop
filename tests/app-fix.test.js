// Поправки раскладки: одна и та же таблица стилей в программе для ПК и в приложении для телефона
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('bridge.js содержит точную копию desktop/ui/app-fix.css', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'ui', 'app-fix.css'), 'utf8');
  const bridge = fs.readFileSync(path.join(__dirname, '..', 'mobile', 'android', 'app', 'src', 'main', 'assets', 'bridge.js'), 'utf8');
  const m = bridge.match(/var APP_FIX_CSS = (".*?");\n/s);
  assert.ok(m, 'APP_FIX_CSS в bridge.js');
  assert.strictEqual(JSON.parse(m[1]), css, 'обновите bridge.js: python3 scripts/sync-app-fix.py');
});
