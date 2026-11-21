/*
 * Автопроверка ГОТОВОЙ программы для ПК (после electron-builder), запускается в CI на Windows/macOS/Linux:
 *   node tests/smoke/desktop-smoke.js <путь к исполняемому файлу> [--real <адрес безопасного тестового стенда>]
 * Сценарии:
 *   A. режим «Сайт» (по умолчанию в программе) — копия сайта на 127.0.0.1;
 *   B. «Встроенный сервер» — программа сама запускает портал;
 *   C. недоступный сайт — экран ошибки;
 *   D. (--real) настоящий сайт — не блокирует сборку, только отчёт.
 * Результаты и скриншоты — в smoke-out/.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn, execSync } = require('child_process');
const { sleep, waitTarget, connect } = require('./cdp');
const scenario = require('./portal-scenario');

const exe = process.argv[2];
const realIdx = process.argv.indexOf('--real');
const REAL = realIdx > 0 && process.env.KU_REAL_DEMO_PASSWORD ? process.argv[realIdx + 1] : null;
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'smoke-out');
fs.mkdirSync(OUT, { recursive: true });
const report = [];
const log = (...a) => { const s = a.join(' '); console.log(s); fs.appendFileSync(path.join(OUT, 'smoke.log'), s + '\n'); };

if (!exe || !fs.existsSync(exe)) { console.error('нет исполняемого файла: ' + exe); process.exit(2); }

const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

async function waitHttp(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(3000) }); if (r.ok) return; } catch { /* ждём */ }
    await sleep(300);
  }
  throw new Error('не отвечает ' + url);
}

function startSite(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ku-site-'));
  fs.cpSync(path.join(ROOT, 'app'), dir, { recursive: true });
  const p = spawn(process.execPath, ['server.js'], { cwd: dir, env: { ...process.env, PORT: String(port), LM_STUDIO_URL: 'http://127.0.0.1:9', DEMO: '1' }, stdio: 'ignore' });
  return { proc: p, dir };
}

function demoPassword(dir) {
  const file = path.join(dir, 'data', 'demo', 'demo-credentials.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'))['student@demo.kz'];
}

function killTree(p) {
  if (!p || p.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: 'ignore' });
    else p.kill('SIGTERM');
  } catch { /* уже завершён */ }
}

async function launch(name, config) {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ku-ud-'));
  if (config) fs.writeFileSync(path.join(ud, 'config.json'), JSON.stringify(config));
  const dbg = await freePort();
  const args = [`--remote-debugging-port=${dbg}`];
  if (process.platform === 'linux') args.push('--no-sandbox');
  const proc = spawn(exe, args, { env: { ...process.env, KU_PORTAL_USER_DATA: ud }, stdio: ['ignore', 'pipe', 'pipe'] });
  const outFile = path.join(OUT, `${name}-app.log`);
  proc.stdout.on('data', (d) => fs.appendFileSync(outFile, d));
  proc.stderr.on('data', (d) => fs.appendFileSync(outFile, d));
  return { proc, ud, base: `http://127.0.0.1:${dbg}` };
}

async function close(app) {
  killTree(app.proc);
  for (let i = 0; i < 40 && app.proc.exitCode === null; i++) await sleep(250);
  if (app.proc.exitCode === null) { try { app.proc.kill('SIGKILL'); } catch { /* */ } }
  await sleep(500);
}

async function step(name, fatal, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    report.push({ name, ok: true, fatal, sec: Math.round((Date.now() - t0) / 1000), result: r });
    log(`✔ ${name}`);
  } catch (e) {
    report.push({ name, ok: false, fatal, sec: Math.round((Date.now() - t0) / 1000), error: e.message });
    log(`✘ ${name}: ${e.message}`);
  }
}

async function portalIn(app, name, site, opts = {}) {
  const t = await waitTarget(app.base, (x) => x.url.startsWith(new URL(site).origin), opts.wait || 60000);
  const c = await connect(t.webSocketDebuggerUrl);
  try {
    return await scenario.run(c, site, { log, shot: (n) => c.screenshot(path.join(OUT, `${name}-${n}.png`)).catch(() => {}), notifExpect: 'granted', demoPassword: opts.demoPassword });
  } catch (e) {
    await c.screenshot(path.join(OUT, `${name}-FAIL.png`)).catch(() => {});
    throw e;
  } finally { c.close(); }
}

(async () => {
  log(`программа: ${exe} · ${process.platform} ${process.arch}`);

  await step('A. режим «Сайт»: вход, оценки, расписание, AI, кабинет, онлайн-экзамен и возврат', true, async () => {
    const port = await freePort();
    const site = startSite(port);
    try {
      await waitHttp(`http://127.0.0.1:${port}/`, 20000);
      const app = await launch('A-site', { mode: 'remote', remoteUrl: `http://127.0.0.1:${port}` });
      try { return await portalIn(app, 'A-site', `http://127.0.0.1:${port}/`, { demoPassword: demoPassword(site.dir) }); } finally { await close(app); }
    } finally { killTree(site.proc); }
  });

  await step('B. встроенный сервер: портал запускается внутри программы', true, async () => {
    const port = await freePort();
    const app = await launch('B-local', { mode: 'local', port, lmUrl: 'http://127.0.0.1:9' });
    try {
      const r = await portalIn(app, 'B-local', `http://127.0.0.1:${port}/`, { demoPassword: demoPassword(path.join(app.ud, 'portal')) });
      const db = path.join(app.ud, 'portal', 'data', 'demo', 'db.json');
      if (!fs.existsSync(db)) throw new Error('нет данных встроенного сервера: ' + db);
      return r;
    } finally {
      await close(app);
      // сервер должен остановиться вместе с программой
      await sleep(1500);
      let alive = false;
      try { await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) }); alive = true; } catch { /* остановлен */ }
      if (alive) throw new Error('встроенный сервер не остановился после выхода из программы');
    }
  });

  await step('C. сайт недоступен: экран ошибки с кнопками', true, async () => {
    const port = await freePort();
    const app = await launch('C-offline', { mode: 'remote', remoteUrl: `http://127.0.0.1:${port}` });
    try {
      const t = await waitTarget(app.base, (x) => x.url.includes('error.html'), 60000);
      const c = await connect(t.webSocketDebuggerUrl);
      const ok = await c.waitFor(`!!document.getElementById('retry') && !!document.getElementById('settings') && document.title.length > 0`, 10000, 'кнопки экрана ошибки');
      await c.screenshot(path.join(OUT, 'C-offline-error.png')).catch(() => {});
      c.close();
      return ok;
    } finally { await close(app); }
  });

  if (REAL) {
    await step(`D. настоящий сайт ${REAL} (не блокирует сборку)`, false, async () => {
      const app = await launch('D-real', null); // настройки по умолчанию
      try { return await portalIn(app, 'D-real', REAL, { wait: 150000, demoPassword: process.env.KU_REAL_DEMO_PASSWORD }); } finally { await close(app); }
    });
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const failed = report.filter((r) => !r.ok && r.fatal);
  log(failed.length ? `ПРОВАЛЕНО: ${failed.length}` : 'ВСЕ ОБЯЗАТЕЛЬНЫЕ ПРОВЕРКИ ПРОЙДЕНЫ');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { log('ошибка автопроверки: ' + e.stack); process.exit(1); });
