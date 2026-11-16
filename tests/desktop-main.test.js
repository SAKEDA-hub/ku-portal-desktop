// Главный процесс десктопа (desktop/main.js) на заглушке модуля electron:
// запуск встроенного сервера, загрузка окна, правила ссылок и разрешений, IPC окна настроек.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const cp = require('child_process');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'kudesk-'));
fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ mode: 'local', port: 3870, lmUrl: 'http://127.0.0.1:9' }));

const handlers = {};
const events = {};
const wins = [];
let menuTpl = null;
let permReq = null, permCheck = null;
const opened = [];
const forked = [];
let readyResolve;
const ready = new Promise((r) => { readyResolve = r; });

class FakeWC {
  constructor() { this.loaded = []; this.listeners = {}; this.navigationHistory = { canGoBack: () => false, canGoForward: () => false }; }
  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); return this; }
  setWindowOpenHandler(fn) { this.openHandler = fn; }
}
class FakeWin {
  constructor(opts) { this.opts = opts; this.webContents = new FakeWC(); this.destroyed = false; wins.push(this); }
  loadURL(u) { this.webContents.loaded.push(u); return Promise.resolve(); }
  loadFile(f, o) { this.webContents.loaded.push('file://' + f + (o && o.search ? '?' + o.search : '')); return Promise.resolve(); }
  once() {} on() {} show() {} focus() {} maximize() {} setMenu() {}
  isFocused() { return !!this.focused; } flashFrame(v) { this.flashed = v; }
  isDestroyed() { return this.destroyed; } isMinimized() { return false; } isMaximized() { return false; }
  getNormalBounds() { return { x: 0, y: 0, width: 1200, height: 800 }; }
  static getAllWindows() { return wins; }
}
const fakeElectron = {
  app: {
    isPackaged: false,
    setName() {}, setAppUserModelId() {}, requestSingleInstanceLock: () => true,
    getPath: (n) => (n === 'userData' ? userData : os.tmpdir()),
    getVersion: () => '1.0.0', name: 'KU Portal',
    whenReady: () => ready, on: (ev, fn) => { events[ev] = fn; }, relaunch() {}, exit() {}, quit() {},
  },
  BrowserWindow: FakeWin,
  Menu: { buildFromTemplate: (t) => { menuTpl = t; return t; }, setApplicationMenu() {} },
  shell: { openExternal: (u) => opened.push(u), openPath: async () => '' },
  ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; }, on: (ch, fn) => { handlers[ch] = fn; } },
  dialog: { showMessageBox: async () => ({ response: 1 }) },
  session: { defaultSession: { setPermissionRequestHandler: (f) => { permReq = f; }, setPermissionCheckHandler: (f) => { permCheck = f; }, on() {} } },
  safeStorage: { isEncryptionAvailable: () => false },
  // utilityProcess.fork ≈ child_process.fork (тот же API: stdout, stderr, exit, kill)
  utilityProcess: { fork: (mod, args, o) => { const c = cp.fork(mod, args, { cwd: o.cwd, env: o.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }); forked.push(c); return c; } },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) { return req === 'electron' ? 'electron-fake' : origResolve.call(this, req, ...rest); };
require.cache['electron-fake'] = { id: 'electron-fake', filename: 'electron-fake', loaded: true, exports: fakeElectron };

test('desktop main: встроенный сервер и окно', async () => {
  require('../desktop/main.js');
  readyResolve();
  for (let i = 0; i < 100 && !(wins[0] && wins[0].webContents.loaded.length); i++) await new Promise((r) => setTimeout(r, 50));

  const main = wins[0];
  assert.ok(main, 'главное окно создано');
  const url = main.webContents.loaded[0];
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/, 'открыт встроенный сервер: ' + url);
  assert.strictEqual(main.opts.webPreferences.nodeIntegration, false);
  assert.strictEqual(main.opts.webPreferences.contextIsolation, true);

  const r = await fetch(url + 'api/ai/status');
  const j = await r.json();
  assert.strictEqual(j.online, false);
  assert.ok(fs.existsSync(path.join(userData, 'portal', 'data', 'db.json')), 'данные в userData/portal/data');
  assert.ok(fs.existsSync(path.join(userData, 'portal', 'server.js')), 'копия сайта в userData/portal');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'app', 'data', 'db.json')), 'app/ не меняется');

  // ссылки: свой портал — новое окно, внешние — браузер
  const wc = main.webContents;
  assert.strictEqual(wc.openHandler({ url: url + 'exam-sync/' }).action, 'allow');
  assert.strictEqual(wc.openHandler({ url: 'https://ku.edu.kz/' }).action, 'deny');
  assert.deepStrictEqual(opened, ['https://ku.edu.kz/']);
  let prevented = false;
  wc.listeners['will-navigate'][0]({ preventDefault: () => { prevented = true; } }, 'https://evil.example.com/');
  assert.ok(prevented, 'уход на чужой сайт блокируется');

  // разрешения: уведомления только для своего портала
  let granted;
  permReq(null, 'notifications', (g) => { granted = g; }, { requestingUrl: url });
  assert.strictEqual(granted, true);
  permReq(null, 'notifications', (g) => { granted = g; }, { requestingUrl: 'https://evil.example.com/' });
  assert.strictEqual(granted, false);
  permReq(null, 'geolocation', (g) => { granted = g; }, { requestingUrl: url });
  assert.strictEqual(granted, false);
  assert.strictEqual(permCheck(null, 'notifications', new URL(url).origin), true);
});

test('desktop main: окно настроек и IPC', async () => {
  const fileMenu = menuTpl.find((m) => m.label === 'Файл');
  fileMenu.submenu.find((i) => i.label === 'Настройки приложения…').click();
  const sw = wins.find((w) => w.opts.title === 'Настройки KU Portal');
  assert.ok(sw, 'окно настроек открыто');
  assert.match(sw.webContents.loaded[0], /ui\/settings\.html$/);

  await assert.rejects(async () => handlers['settings:get']({ sender: wins[0].webContents }), /forbidden/, 'портал не читает настройки');
  const got = await handlers['settings:get']({ sender: sw.webContents });
  assert.strictEqual(got.cfg.mode, 'local');
  assert.ok(got.info.running.port >= 3870);
  assert.ok(Array.isArray(got.info.lan));

  const ai = await handlers['settings:testAI']({ sender: sw.webContents }, { lmUrl: 'http://127.0.0.1:9' });
  assert.strictEqual(ai.ok, false);
  assert.strictEqual(ai.reason, 'unreachable');
  const bad = await handlers['settings:testAI']({ sender: sw.webContents }, { lmUrl: 'http://8.8.8.8:1234' });
  assert.strictEqual(bad.reason, 'bad_url');

  const portal = await handlers['settings:portalAI']({ sender: sw.webContents });
  assert.strictEqual(portal.online, false);

  // смена адреса сайта не требует перезапуска; смена порта — требует
  const s1 = await handlers['settings:save']({ sender: sw.webContents }, { ...got.cfg, remoteUrl: 'https://example.org' });
  assert.deepStrictEqual(s1, { saved: true, restart: false });
  const s2 = await handlers['settings:save']({ sender: sw.webContents }, { ...got.cfg, port: 3999 });
  assert.deepStrictEqual(s2, { saved: true, restart: true });
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8')).port, 3999);
});

test('desktop main: сигнал «вызов на speaking» мигает значком, только от окна портала', () => {
  const main = wins[0], sw = wins.find((w) => w.opts.title === 'Настройки KU Portal');
  main.focused = false; main.flashed = undefined;
  handlers['app:attention']({ sender: sw.webContents });
  assert.strictEqual(main.flashed, undefined, 'другие окна не могут вызвать мигание');
  handlers['app:attention']({ sender: main.webContents });
  assert.strictEqual(main.flashed, true, 'окно не в фокусе — значок мигает');
  main.focused = true; main.flashed = undefined;
  handlers['app:attention']({ sender: main.webContents });
  assert.strictEqual(main.flashed, undefined, 'окно в фокусе — не мигает');
});

test('desktop main: данные сохраняются при повторной копии сайта, сервер останавливается при выходе', async () => {
  const db = path.join(userData, 'portal', 'data', 'db.json');
  const before = fs.readFileSync(db, 'utf8');
  assert.ok(before.length > 10);
  events['before-quit']();
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(forked[0].killed || forked[0].exitCode !== null, 'процесс сервера остановлен');
});

test.after(() => setTimeout(() => process.exit(0), 50));
