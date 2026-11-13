// Встроенный сервер: app/ — точная копия сайта; десктоп запускает его из копии в папке пользователя
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

const APP = path.join(__dirname, '..', 'app');

function start(dir, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(dir, 'server.js')], { cwd: dir, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const t = setTimeout(() => { p.kill(); reject(new Error('сервер не стартовал:\n' + out)); }, 15000);
    const on = (d) => {
      out += d;
      const m = out.match(/KU Portal: http:\/\/localhost:(\d+)/);
      if (m) { clearTimeout(t); resolve({ proc: p, port: Number(m[1]), log: () => out }); }
    };
    p.stdout.on('data', on); p.stderr.on('data', on);
    p.on('exit', (c) => { clearTimeout(t); reject(new Error('сервер завершился ' + c + ':\n' + out)); });
  });
}

test('app/ совпадает с сайтом: нет следов патчей', () => {
  const src = fs.readFileSync(path.join(APP, 'server.js'), 'utf8');
  assert.ok(!/KU_DATA_DIR|module\.exports|KU Portal Desktop/.test(src), 'server.js не изменён');
});

test('сервер из копии: вход, онлайн-экзамен, статус AI, данные рядом с копией', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kuportal-'));
  fs.cpSync(APP, dir, { recursive: true });
  const dataDir = path.join(dir, 'data');
  const s = await start(dir, { PORT: String(await freePort()), LM_STUDIO_URL: 'http://127.0.0.1:9', DEMO: '1' });
  t.after(() => s.proc.kill());
  const base = `http://127.0.0.1:${s.port}`;

  assert.match(s.log(), /Загружена локальная база KU: \d+ фрагментов/);
  assert.ok(fs.existsSync(path.join(dataDir, 'db.json')), 'db.json в копии');
  assert.ok(!fs.existsSync(path.join(APP, 'data', 'db.json')), 'в app/ ничего не пишется');

  const home = await fetch(base + '/');
  assert.strictEqual(home.status, 200);
  assert.match(await home.text(), /KU Portal/);

  const login = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@demo.kz', password: '1234' }),
  });
  const lj = await login.json();
  assert.ok(lj.token, 'токен входа');

  const exam = await fetch(base + '/exam-sync/');
  assert.strictEqual(exam.status, 200);

  const ai = await (await fetch(base + '/api/ai/status')).json();
  assert.strictEqual(ai.online, false);
  assert.ok(ai.ctx > 1000);
  assert.ok(ai.reason);

  const chat = await (await fetch(base + '/api/ai/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + lj.token },
    body: JSON.stringify({ message: 'Какие есть общежития в университете?' }),
  })).json();
  assert.ok(chat.reply, 'помощник отвечает даже без модели (сообщение о недоступности)');
});
