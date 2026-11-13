/*
 * Автопроверка приложения Android (отладочная сборка, WebView доступен через DevTools).
 * Сценарии: экран подключения → компьютер 10.0.2.2:3000 → вход, записи, AI, кабинет, онлайн-экзамен
 * и возврат; мост: системное уведомление, сохранение файла; (не блокирует) настоящий сайт.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { sleep, waitTarget, connect } = require('./cdp');
const scenario = require('./portal-scenario');

const OUT = path.join(__dirname, '..', '..', 'smoke-out');
const REAL = process.env.KU_REAL_SITE || 'https://ku-portal.onrender.com';
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const report = [];
const log = (...a) => { const s = a.join(' '); console.log(s); fs.appendFileSync(path.join(OUT, 'smoke.log'), s + '\n'); };
const screen = (n) => { try { fs.writeFileSync(path.join(OUT, `android-${n}.png`), execSync('adb exec-out screencap -p')); } catch { /* */ } };

async function step(name, fatal, fn) {
  try { const r = await fn(); report.push({ name, ok: true, fatal, result: r }); log('✔ ' + name); }
  catch (e) { report.push({ name, ok: false, fatal, error: e.message }); log('✘ ' + name + ': ' + e.message); screen('FAIL-' + report.length); }
}

function forward() {
  const unix = sh('adb shell cat /proc/net/unix');
  const m = unix.match(/@?(webview_devtools_remote_\d+)/);
  if (!m) throw new Error('нет сокета отладки WebView (приложение не запущено?)');
  sh('adb forward tcp:9222 localabstract:' + m[1]);
  return 'http://127.0.0.1:9222';
}

async function page(base, pred, ms) {
  const t = await waitTarget(base, pred, ms);
  return connect(t.webSocketDebuggerUrl);
}

async function connectTo(base, kind, addr, expectOrigin, ms) {
  let c = await page(base, (x) => x.url.includes('connect.html'), 30000);
  await c.evaluate(`(() => {
    document.querySelector('[data-v=${kind}]').click();
    ${addr ? `document.getElementById(${JSON.stringify(kind === 'pc' ? 'pcAddr' : 'customAddr')}).value = ${JSON.stringify(addr)};` : ''}
    document.getElementById('go').click(); return true; })()`);
  await sleep(1500);
  screen(kind + '-checking');
  c.close();
  c = await page(base, (x) => x.url.startsWith(expectOrigin), ms);
  return c;
}

(async () => {
  const base = forward();
  log('устройство: ' + fs.readFileSync(path.join(OUT, 'device.txt'), 'utf8').replace(/\n/g, ' · '));

  await step('экран «Подключение» открывается при первом запуске', true, async () => {
    const c = await page(base, (x) => x.url.includes('connect.html'), 30000);
    const r = await c.evaluate(`({ kinds: document.querySelectorAll('#kinds .opt').length, site: document.querySelector('#siteHint').textContent, ver: document.getElementById('ver').textContent })`);
    c.close();
    screen('01-connect');
    if (r.kinds !== 3) throw new Error('нет вариантов подключения');
    return r;
  });

  let c;
  await step('подключение к компьютеру 10.0.2.2:3000 и сценарий портала', true, async () => {
    c = await connectTo(base, 'pc', '10.0.2.2:3000', 'http://10.0.2.2:3000', 60000);
    return scenario.run(c, 'http://10.0.2.2:3000/', { log, shot: async (n) => screen('pc-' + n), notifExpect: null });
  });

  await step('мост приложения подключён (KUApp, Notification)', true, async () => {
    const r = await c.evaluate(`({ bridge: window.__kuBridge === true, app: typeof window.KUApp, notif: typeof Notification, perm: Notification.permission })`);
    if (!r.bridge || r.app !== 'object' || r.notif !== 'function') throw new Error(JSON.stringify(r));
    return r;
  });

  await step('разрешение на уведомления: до разрешения «default», после — «granted»', true, async () => {
    const sdk = Number(sh('adb shell getprop ro.build.version.sdk').trim());
    const before = await c.evaluate(`Notification.permission`);
    if (sdk >= 33 && before !== 'default') throw new Error('до разрешения: ' + before);
    // то же, что нажать «Разрешить» в системном окне Android 13+
    if (sdk >= 33) sh('adb shell pm grant kz.ku.portal android.permission.POST_NOTIFICATIONS');
    const after = await c.evaluate(`Notification.permission`);
    if (after !== 'granted') throw new Error('после разрешения: ' + after);
    return { sdk, before, after };
  });

  await step('системное уведомление Android («Проверить уведомление» в кабинете)', true, async () => {
    await c.evaluate(`(() => { setPref('notifPush', true); setPref('notifSound', false); testNotif(); return true; })()`);
    await sleep(2500);
    screen('notif');
    const dump = sh('adb shell dumpsys notification --noredact');
    const found = dump.includes('pkg=kz.ku.portal') || dump.includes('kz.ku.portal');
    if (!found) throw new Error('уведомление KU Portal не найдено в системе');
    return true;
  });

  await step('сохранение файла («Скачать мои данные» → системное окно «Сохранить»)', true, async () => {
    await c.evaluate(`exportData(), true`);
    await sleep(4000);
    screen('save-dialog');
    const top = sh('adb shell dumpsys activity activities');
    const ok = /documentsui|DocumentsUI|com.android.documentsui|com.google.android.documentsui/i.test(top);
    sh('adb shell input keyevent 4');
    await sleep(1500);
    if (!ok) throw new Error('системное окно сохранения не открылось');
    return true;
  });

  await step(`настоящий сайт ${REAL} (не блокирует сборку)`, false, async () => {
    try { c.close(); } catch { /* */ }
    // «Сменить сервер» из портала → экран подключения → «Сайт портала»
    const cur = await page(base, (x) => x.url.startsWith('http://10.0.2.2:3000'), 10000);
    await cur.evaluate(`KUApp.openConnect(), true`);
    cur.close();
    await sleep(1500);
    const real = await connectTo(base, 'site', null, new URL(REAL).origin, 150000);
    try { return await scenario.run(real, REAL, { log, shot: async (n) => screen('real-' + n), notifExpect: null }); }
    finally { real.close(); }
  });

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const failed = report.filter((r) => !r.ok && r.fatal);
  log(failed.length ? 'ПРОВАЛЕНО: ' + failed.length : 'ВСЕ ОБЯЗАТЕЛЬНЫЕ ПРОВЕРКИ ПРОЙДЕНЫ');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { log('ошибка автопроверки: ' + e.stack); process.exit(1); });
