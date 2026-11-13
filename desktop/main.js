/*
 * KU Portal Desktop — главный процесс Electron.
 *
 * Режим «Встроенный сервер» (по умолчанию): внутри приложения запускается тот же server.js,
 * что и на сайте (папка app/), поэтому работает всё: вход/регистрация, оценки, расписание,
 * рейтинг, AI-помощник (Gemma в LM Studio), онлайн-экзамен (/exam-sync/), все настройки.
 * Данные хранятся в папке пользователя (<userData>/data), а не в каталоге программы.
 * При включённом «Доступ с телефона» сервер слушает 0.0.0.0 — мобильное приложение
 * подключается к ПК по Wi-Fi и получает тот же портал, включая AI.
 *
 * Режим «Сайт»: окно открывает опубликованный портал (например, https://ku-portal.onrender.com).
 */
const { app, BrowserWindow, Menu, shell, ipcMain, dialog, session, safeStorage } = require('electron');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { createConfigStore, sanitize, needsRestart } = require('./config');

app.setName('KU Portal');
if (process.platform === 'win32') app.setAppUserModelId('kz.ku.portal.desktop'); // уведомления Windows

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const USER_DIR = app.getPath('userData');
const DATA_DIR = path.join(USER_DIR, 'data');
const LOG_FILE = path.join(USER_DIR, 'server.log');
const WIN_STATE = path.join(USER_DIR, 'window.json');
const UI = (f) => path.join(__dirname, 'ui', f);

let store;            // createConfigStore(...) после app.ready (safeStorage доступен только тогда)
let cfg;              // текущие настройки
let serverPort = null;
let serverLan = false; // сервер запущен с доступом из локальной сети
let startError = null;
let mainWin = null;
let settingsWin = null;
let targetUrl = null; // что должно быть открыто в главном окне

/* Каталог с исходниками портала: в сборке — resources/app, при разработке — ../app */
function appDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..', 'app');
}

/* ------------------------------ журнал сервера ------------------------------ */
function setupLog() {
  try {
    fs.mkdirSync(USER_DIR, { recursive: true });
    try { if (fs.statSync(LOG_FILE).size > 2e6) fs.renameSync(LOG_FILE, LOG_FILE + '.1'); } catch { /* нет файла */ }
    const out = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    for (const lvl of ['log', 'warn', 'error']) {
      const orig = console[lvl].bind(console);
      console[lvl] = (...a) => {
        orig(...a);
        try { out.write(`[${new Date().toISOString()}] ${lvl.toUpperCase()} ${a.map((x) => (x instanceof Error ? x.stack : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`); } catch { /* диск */ }
      };
    }
  } catch { /* журнал не критичен */ }
}

/* ------------------------------ встроенный сервер ------------------------------ */
function portFree(port, host) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, host);
  });
}
async function pickPort(start, host) {
  for (let p = start; p < start + 30 && p <= 65535; p++) if (await portFree(p, host)) return p;
  throw new Error(`Нет свободного порта в диапазоне ${start}–${start + 29}`);
}

async function startServer(c) {
  const host = c.lan ? '0.0.0.0' : '127.0.0.1';
  const port = await pickPort(c.port, host);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  Object.assign(process.env, {
    PORT: String(port),
    HOST: host,
    KU_DATA_DIR: DATA_DIR,
    LM_STUDIO_URL: c.lmUrl,
    LM_STUDIO_MODEL: c.lmModel,
    DEMO: c.demo ? '1' : '0',
  });
  if (c.lmKey) process.env.LM_STUDIO_API_KEY = c.lmKey; else delete process.env.LM_STUDIO_API_KEY;

  const server = require(path.join(appDir(), 'server.js'));
  await new Promise((resolve, reject) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
    server.once('error', reject);
  });
  server.on('error', (e) => console.error('[server]', e));
  return port;
}

/* IPv4-адреса ПК в локальной сети — их вводят в мобильном приложении */
function lanAddresses(port) {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, url: `http://${a.address}:${port}` });
    }
  }
  return out;
}

/* --------------------------------- окна --------------------------------- */
function loadWinState() {
  try { const s = JSON.parse(fs.readFileSync(WIN_STATE, 'utf8')); if (s.width > 400 && s.height > 400) return s; } catch { /* нет */ }
  return { width: 1280, height: 860 };
}
function saveWinState(win) {
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(WIN_STATE, JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch { /* не критично */ }
}

function sameOrigin(url) {
  try { return new URL(url).origin === new URL(targetUrl).origin; } catch { return false; }
}
function isLocalUi(url) {
  return url.startsWith('file:');
}

function showError(title, details) {
  if (!mainWin || mainWin.isDestroyed()) return;
  const q = new URLSearchParams({ title, details: details || '', url: targetUrl || '', mode: cfg.mode });
  mainWin.loadFile(UI('error.html'), { search: q.toString() }).catch(() => {});
}

function openTarget() {
  if (!mainWin || mainWin.isDestroyed()) return;
  if (startError) return showError('Встроенный сервер не запустился', startError);
  if (cfg.mode === 'remote') {
    // бесплатный Render «просыпается» до минуты — показываем экран ожидания, затем грузим сайт
    mainWin.loadFile(UI('loading.html'), { search: new URLSearchParams({ url: targetUrl }).toString() })
      .catch(() => {})
      .finally(() => mainWin && !mainWin.isDestroyed() && mainWin.loadURL(targetUrl).catch(() => { /* did-fail-load покажет ошибку */ }));
  } else {
    mainWin.loadURL(targetUrl).catch(() => { /* did-fail-load покажет ошибку */ });
  }
}

function createMainWindow() {
  const st = loadWinState();
  mainWin = new BrowserWindow({
    ...st,
    minWidth: 380,
    minHeight: 560,
    show: false,
    title: 'KU Portal',
    icon: path.join(__dirname, 'ui', 'icon.png'),
    backgroundColor: '#f8f8f7',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (st.maximized) mainWin.maximize();
  mainWin.once('ready-to-show', () => mainWin.show());
  mainWin.on('close', () => saveWinState(mainWin));
  mainWin.on('closed', () => { mainWin = null; });

  hardenContents(mainWin.webContents);

  mainWin.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ERR_ABORTED: переход прерван навигацией */) return;
    if (isLocalUi(url)) return;
    showError('Не удалось открыть портал', `${desc} (${code})\n${url}`);
  });
  mainWin.webContents.on('render-process-gone', (_e, d) => {
    console.error('[renderer] процесс завершился:', d.reason);
    if (d.reason !== 'clean-exit') setTimeout(openTarget, 500);
  });
  mainWin.webContents.on('page-title-updated', (e) => { e.preventDefault(); });

  openTarget();
}

/* Общие правила безопасности для окон с порталом */
function hardenContents(wc) {
  // ссылки «в новой вкладке»: свой портал — в новом окне приложения, всё остальное — в браузере
  wc.setWindowOpenHandler(({ url }) => {
    if (sameOrigin(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1180, height: 820, icon: path.join(__dirname, 'ui', 'icon.png'), autoHideMenuBar: true,
          webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('did-create-window', (child) => hardenContents(child.webContents));
  wc.on('will-navigate', (e, url) => {
    if (sameOrigin(url) || isLocalUi(url)) return;
    e.preventDefault();
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
  });
}

function setupPermissions() {
  const ses = session.defaultSession;
  const allowed = new Set(['notifications', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen']);
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    const origin = details && (details.requestingUrl || details.securityOrigin);
    cb(allowed.has(permission) && !!origin && sameOrigin(origin));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => allowed.has(permission) && sameOrigin(requestingOrigin));
  // скачивание «Мои данные (JSON)», CSV ведомости экзамена — стандартный диалог сохранения
  ses.on('will-download', (_e, item) => {
    item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
  });
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 720,
    height: 820,
    minWidth: 520,
    minHeight: 560,
    parent: mainWin || undefined,
    modal: false,
    title: 'Настройки KU Portal',
    icon: path.join(__dirname, 'ui', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#f8f8f7',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(UI('settings.html'));
  settingsWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  settingsWin.webContents.on('will-navigate', (e) => e.preventDefault());
  settingsWin.on('closed', () => { settingsWin = null; });
}

function showPhoneHelp() {
  if (cfg.mode !== 'local') {
    return dialog.showMessageBox(mainWin, {
      type: 'info', title: 'Подключить телефон',
      message: 'Приложение открывает сайт портала',
      detail: `В мобильном приложении KU Portal выберите «Сайт» и укажите тот же адрес:\n${cfg.remoteUrl}`,
    });
  }
  if (!serverLan) {
    return dialog.showMessageBox(mainWin, {
      type: 'info', title: 'Подключить телефон', buttons: ['Открыть настройки', 'Закрыть'], defaultId: 0,
      message: 'Доступ с телефона выключен',
      detail: cfg.lan ? 'Доступ включён в настройках, но вступит в силу после перезапуска приложения.' : 'Включите «Доступ с телефона по Wi-Fi» в настройках. После перезапуска здесь появится адрес для мобильного приложения.',
    }).then((r) => { if (r.response === 0) openSettings(); });
  }
  const list = lanAddresses(serverPort);
  return dialog.showMessageBox(mainWin, {
    type: 'info', title: 'Подключить телефон',
    message: list.length ? 'Введите этот адрес в мобильном приложении KU Portal' : 'ПК не подключён к сети',
    detail: list.length
      ? list.map((a) => `${a.url}   (${a.name})`).join('\n') + '\n\nТелефон и компьютер должны быть в одной Wi-Fi сети. Если Windows спросит про брандмауэр — разрешите доступ в частных сетях.'
      : 'Подключите компьютер к Wi-Fi или локальной сети.',
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const tpl = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about', label: 'О KU Portal' }, { type: 'separator' }, { role: 'hide', label: 'Скрыть' }, { role: 'quit', label: 'Выйти' }] }] : []),
    {
      label: 'Файл',
      submenu: [
        { label: 'Главная портала', accelerator: 'CmdOrCtrl+H', click: () => openTarget() },
        { label: 'Настройки приложения…', accelerator: 'CmdOrCtrl+,', click: openSettings },
        { type: 'separator' },
        { label: 'Открыть папку с данными', click: () => shell.openPath(DATA_DIR) },
        { label: 'Открыть журнал сервера', click: () => shell.openPath(LOG_FILE) },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Закрыть окно' } : { role: 'quit', label: 'Выход' },
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' }, { role: 'redo', label: 'Повторить' }, { type: 'separator' },
        { role: 'cut', label: 'Вырезать' }, { role: 'copy', label: 'Копировать' }, { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить всё' },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { label: 'Назад', accelerator: 'Alt+Left', click: (_m, w) => w && w.webContents.navigationHistory.canGoBack() && w.webContents.navigationHistory.goBack() },
        { label: 'Вперёд', accelerator: 'Alt+Right', click: (_m, w) => w && w.webContents.navigationHistory.canGoForward() && w.webContents.navigationHistory.goForward() },
        { role: 'reload', label: 'Обновить' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Обычный масштаб' }, { role: 'zoomIn', label: 'Крупнее' }, { role: 'zoomOut', label: 'Мельче' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Во весь экран' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика' },
      ],
    },
    {
      label: 'Справка',
      submenu: [
        { label: 'Подключить телефон…', click: showPhoneHelp },
        { label: 'Открыть портал в браузере', click: () => targetUrl && shell.openExternal(targetUrl) },
        { type: 'separator' },
        { label: 'Репозиторий на GitHub', click: () => shell.openExternal('https://github.com/SAKEDA-hub/ku-portal-desktop') },
        { label: `Версия ${app.getVersion()}`, enabled: false },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

/* ------------------------------ проверка LM Studio ------------------------------ */
/* Те же правила адреса, что и в server.js (lmStudioOrigin): частный IPv4/localhost или https-туннель */
function lmOrigin(url) {
  const u = new URL(url);
  const parts = u.hostname.split('.').map(Number);
  const privateIPv4 = parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127));
  const local = privateIPv4 || u.hostname === 'localhost';
  const publicHttps = u.protocol === 'https:' && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname);
  const p = u.pathname.replace(/\/+$/, '');
  if (!['http:', 'https:'].includes(u.protocol) || !(local || publicHttps) || u.username || u.password || u.search || u.hash || !['', '/v1'].includes(p)) {
    throw new Error('Нужен http://localhost:1234, http://<частный IP>:порт или https://<адрес туннеля>');
  }
  return u.origin;
}
async function testLm(c) {
  let origin;
  try { origin = lmOrigin(c.lmUrl); } catch (e) { return { ok: false, reason: 'bad_url', message: e.message }; }
  const headers = { Accept: 'application/json', 'ngrok-skip-browser-warning': '1' };
  if (c.lmKey) headers.Authorization = `Bearer ${c.lmKey}`;
  try {
    const r = await fetch(origin + '/v1/models', { headers, signal: AbortSignal.timeout(8000) });
    if (r.status === 401 || r.status === 403) return { ok: false, reason: 'auth', message: `LM Studio отклонил ключ (HTTP ${r.status})` };
    if (!r.ok) return { ok: false, reason: 'http', message: `HTTP ${r.status}` };
    const j = await r.json();
    const ids = (j.data || []).map((m) => m.id).filter(Boolean);
    if (!ids.length) return { ok: false, reason: 'no_model', message: 'Сервер LM Studio работает, но модель не загружена — загрузите Gemma' };
    return { ok: true, models: ids, message: `Подключено. Модели: ${ids.slice(0, 6).join(', ')}` };
  } catch (e) {
    const timeout = e.name === 'TimeoutError' || e.name === 'AbortError';
    return { ok: false, reason: timeout ? 'timeout' : 'unreachable', message: timeout ? 'Нет ответа (таймаут)' : `Нет соединения (${e.cause?.code || e.message}). Запущен ли сервер в LM Studio (Developer → Start Server)?` };
  }
}

/* ------------------------------------ IPC ------------------------------------ */
function fromSettings(e) { return settingsWin && !settingsWin.isDestroyed() && e.sender === settingsWin.webContents; }
function fromMain(e) { return mainWin && !mainWin.isDestroyed() && e.sender === mainWin.webContents; }

function setupIpc() {
  ipcMain.handle('settings:get', (e) => {
    if (!fromSettings(e)) throw new Error('forbidden');
    return {
      cfg,
      info: {
        version: app.getVersion(),
        running: cfg.mode === 'local' ? { port: serverPort, error: startError } : null,
        lanActive: serverLan,
        lan: serverLan && serverPort ? lanAddresses(serverPort) : [],
        dataDir: DATA_DIR,
        encrypt: store.canEncrypt(),
      },
    };
  });
  ipcMain.handle('settings:save', async (e, next) => {
    if (!fromSettings(e)) throw new Error('forbidden');
    const prev = cfg;
    const clean = sanitize(next, prev);
    cfg = store.save(clean);
    if (needsRestart(prev, cfg)) {
      const r = await dialog.showMessageBox(settingsWin, {
        type: 'question', buttons: ['Перезапустить сейчас', 'Позже'], defaultId: 0, cancelId: 1,
        title: 'Перезапуск', message: 'Настройки сохранены', detail: 'Изменения вступят в силу после перезапуска приложения.',
      });
      if (r.response === 0) { app.relaunch(); app.exit(0); }
      return { saved: true, restart: r.response !== 0 };
    }
    if (cfg.remoteUrl !== prev.remoteUrl && cfg.mode === 'remote') { targetUrl = cfg.remoteUrl + '/'; openTarget(); }
    return { saved: true, restart: false };
  });
  ipcMain.handle('settings:testAI', async (e, c) => {
    if (!fromSettings(e)) throw new Error('forbidden');
    return testLm(sanitize(c, cfg));
  });
  ipcMain.handle('settings:portalAI', async (e) => {
    if (!fromSettings(e)) throw new Error('forbidden');
    if (!targetUrl) return { online: false, reason: 'no_server' };
    try {
      const r = await fetch(new URL('/api/ai/status', targetUrl), { signal: AbortSignal.timeout(15000) });
      return await r.json();
    } catch (err) { return { online: false, reason: 'unreachable', message: err.message }; }
  });
  ipcMain.handle('settings:openPath', (e, which) => {
    if (!fromSettings(e)) throw new Error('forbidden');
    return shell.openPath(which === 'log' ? LOG_FILE : DATA_DIR);
  });
  ipcMain.handle('settings:defaults', (e) => {
    if (!fromSettings(e)) throw new Error('forbidden');
    return sanitize({});
  });

  // экран ошибки / ожидания в главном окне
  ipcMain.on('app:openSettings', (e) => { if (fromMain(e)) openSettings(); });
  ipcMain.on('app:retry', (e) => { if (fromMain(e)) openTarget(); });
}

/* ------------------------------------ старт ------------------------------------ */
app.on('second-instance', () => {
  if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
});

app.whenReady().then(async () => {
  setupLog();
  store = createConfigStore(USER_DIR, safeStorage);
  cfg = store.load();
  buildMenu();
  setupIpc();
  setupPermissions();

  if (cfg.mode === 'local') {
    try {
      serverPort = await startServer(cfg);
      serverLan = cfg.lan;
      targetUrl = `http://127.0.0.1:${serverPort}/`;
      console.log(`[desktop] встроенный сервер: ${targetUrl}${cfg.lan ? ' (доступ из локальной сети включён)' : ''}`);
    } catch (e) {
      startError = e.stack || e.message;
      console.error('[desktop] сервер не запустился:', e);
    }
  } else {
    targetUrl = cfg.remoteUrl + '/';
  }

  createMainWindow();

  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createMainWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
