// Настройки десктопа: нормализация, шифрование ключа, признак перезапуска
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DEFAULTS, sanitize, createConfigStore, needsRestart } = require('../desktop/config');

const fakeSafe = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from('enc:' + s),
  decryptString: (b) => b.toString().replace(/^enc:/, ''),
};

test('sanitize: значения по умолчанию и мусор', () => {
  assert.deepStrictEqual(sanitize({}), { ...DEFAULTS });
  const c = sanitize({ mode: 'evil', port: 80, remoteUrl: 'javascript:alert(1)', lmUrl: 'ftp://x', lan: 1, demo: false });
  assert.strictEqual(c.mode, 'local');
  assert.strictEqual(c.port, 3000);
  assert.strictEqual(c.remoteUrl, DEFAULTS.remoteUrl);
  assert.strictEqual(c.lmUrl, DEFAULTS.lmUrl);
  assert.strictEqual(c.lan, true);
  assert.strictEqual(c.demo, false);
  assert.strictEqual(sanitize({ remoteUrl: 'https://a.example.org/' }).remoteUrl, 'https://a.example.org');
});

test('store: ключ LM Studio хранится зашифрованным', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kucfg-'));
  const st = createConfigStore(dir, fakeSafe);
  st.save({ lmKey: 'secret-key', port: 3100 });
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  assert.ok(!JSON.stringify(raw).includes('secret-key'));
  assert.ok(raw.lmKeyEnc);
  const back = st.load();
  assert.strictEqual(back.lmKey, 'secret-key');
  assert.strictEqual(back.port, 3100);
});

test('store: без хранилища ключей и с битым файлом', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kucfg-'));
  fs.writeFileSync(path.join(dir, 'config.json'), '{битый');
  const st = createConfigStore(dir, null);
  assert.deepStrictEqual(st.load(), { ...DEFAULTS });
  st.save({ lmKey: 'k' });
  assert.strictEqual(st.load().lmKey, 'k');
});

test('needsRestart', () => {
  const a = sanitize({});
  assert.strictEqual(needsRestart(a, { ...a, remoteUrl: 'https://x.org' }), false);
  assert.strictEqual(needsRestart(a, { ...a, lan: true }), true);
  assert.strictEqual(needsRestart(a, { ...a, lmUrl: 'http://192.168.1.2:1234' }), true);
});
