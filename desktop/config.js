/*
 * Настройки KU Portal Desktop: <userData>/config.json.
 * Ключ LM Studio шифруется средствами ОС (Electron safeStorage), если они доступны.
 * Модуль не зависит от Electron напрямую — safeStorage передаётся снаружи (удобно тестировать).
 */
const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  mode: 'remote',                        // 'remote' — сайт портала (те же аккаунты и данные); 'local' — встроенный сервер
  remoteUrl: 'https://ku-portal.onrender.com',
  port: 3000,                            // порт встроенного сервера (если занят — берётся следующий свободный)
  demo: true,                            // тестовые аккаунты (teacher@demo.kz / student@demo.kz, пароль 1234)
  lmUrl: 'http://localhost:1234',        // LM Studio (Gemma) — AI-помощник
  lmModel: 'google/gemma-4-e4b',
  lmKey: '',                             // хранится зашифрованным (lmKeyEnc), в памяти — открытым
});

function clampPort(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : DEFAULTS.port;
}

function normUrl(v, fallback) {
  try {
    const u = new URL(String(v || '').trim());
    if (!/^https?:$/.test(u.protocol)) return fallback;
    return u.href.replace(/\/+$/, '');
  } catch { return fallback; }
}

/* Проверка и нормализация того, что пришло из окна настроек */
function sanitize(input, base = DEFAULTS) {
  const c = { ...base, ...(input || {}) };
  return {
    mode: c.mode === 'local' ? 'local' : 'remote',
    remoteUrl: normUrl(c.remoteUrl, DEFAULTS.remoteUrl),
    port: clampPort(c.port),
    demo: c.demo !== false,
    lmUrl: normUrl(c.lmUrl, DEFAULTS.lmUrl),
    lmModel: String(c.lmModel || DEFAULTS.lmModel).trim().slice(0, 200) || DEFAULTS.lmModel,
    lmKey: String(c.lmKey || '').trim().slice(0, 500),
  };
}

function createConfigStore(dir, safeStorage) {
  const file = path.join(dir, 'config.json');
  const canEncrypt = () => { try { return !!(safeStorage && safeStorage.isEncryptionAvailable()); } catch { return false; } };

  function load() {
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { /* первый запуск или битый файл */ }
    let lmKey = '';
    if (raw.lmKeyEnc && canEncrypt()) {
      try { lmKey = safeStorage.decryptString(Buffer.from(raw.lmKeyEnc, 'base64')); } catch { lmKey = ''; }
    } else if (raw.lmKeyPlain) {
      lmKey = raw.lmKeyPlain;
    }
    return sanitize({ ...raw, lmKey });
  }

  function save(cfg) {
    const c = sanitize(cfg);
    const out = { ...c };
    delete out.lmKey;
    if (c.lmKey) {
      if (canEncrypt()) out.lmKeyEnc = safeStorage.encryptString(c.lmKey).toString('base64');
      else out.lmKeyPlain = c.lmKey; // ОС без хранилища ключей (часть Linux) — сохраняем как есть
    }
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
    fs.renameSync(tmp, file);
    return c;
  }

  return { load, save, file, canEncrypt };
}

/* Меняется ли что-то, что требует перезапуска встроенного сервера */
function needsRestart(a, b) {
  return ['mode', 'port', 'demo', 'lmUrl', 'lmModel', 'lmKey'].some((k) => a[k] !== b[k]);
}

module.exports = { DEFAULTS, sanitize, createConfigStore, needsRestart };
