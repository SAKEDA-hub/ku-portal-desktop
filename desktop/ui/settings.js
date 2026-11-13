/* Окно «Настройки приложения». API — window.kuSettings (settings-preload.js) */
const api = window.kuSettings;
const $ = (id) => document.getElementById(id);
let cfg = null;
let info = null;

const REASONS = {
  unreachable: 'LM Studio не отвечает по этому адресу',
  timeout: 'нет ответа (таймаут)',
  auth: 'неверный ключ API',
  no_model: 'модель не загружена',
  bad_response: 'по адресу отвечает не LM Studio',
  bad_url: 'некорректный адрес',
  no_server: 'портал не запущен',
};

function note(el, kind, text) {
  el.className = 'note ' + kind;
  el.textContent = text;
}

function setMode(v) {
  document.querySelectorAll('#modeSeg .opt').forEach((o) => {
    const on = o.dataset.v === v;
    o.classList.toggle('on', on);
    o.querySelector('input').checked = on;
  });
  const local = v === 'local';
  $('remoteBox').classList.toggle('hide', local);
  $('localBox').classList.toggle('hide', !local);
  $('phoneCard').classList.toggle('hide', !local);
  $('aiCard').classList.toggle('hide', !local);
  $('aiRemoteCard').classList.toggle('hide', local);
}

function fill(c) {
  setMode(c.mode);
  $('remoteUrl').value = c.remoteUrl;
  $('port').value = c.port;
  $('demo').checked = c.demo;
  $('lmUrl').value = c.lmUrl;
  $('lmModel').value = c.lmModel;
  $('lmKey').value = c.lmKey;
}

function read() {
  return {
    mode: document.querySelector('input[name=mode]:checked')?.value || 'local',
    remoteUrl: $('remoteUrl').value.trim(),
    port: Number($('port').value),
    demo: $('demo').checked,
    lmUrl: $('lmUrl').value.trim(),
    lmModel: $('lmModel').value.trim(),
    lmKey: $('lmKey').value.trim(),
  };
}

function renderInfo() {
  $('ver').textContent = `KU Portal Desktop ${info.version}`;
  $('dataDir').textContent = info.dataDir;
  $('encHint').textContent = info.encrypt
    ? 'Ключ хранится в зашифрованном виде (средствами системы).'
    : 'В этой системе нет хранилища ключей — ключ хранится в файле настроек без шифрования.';
  const st = $('status');
  if (info.running) {
    st.classList.remove('hide');
    if (info.running.error) note(st, 'bad', 'Встроенный сервер не запустился:\n' + info.running.error.split('\n')[0]);
    else note(st, 'ok', `Встроенный сервер работает: http://127.0.0.1:${info.running.port}`);
  }
  const box = $('lanAddrs');
  box.textContent = '';
  if (cfg.mode === 'local' && info.running && info.running.port) {
    if (info.lan.length) {
      info.lan.forEach((a) => {
        const d = document.createElement('div');
        d.innerHTML = '<span class="addr"></span> <small></small>';
        d.querySelector('.addr').textContent = a.url;
        d.querySelector('small').textContent = '— ' + a.name;
        box.appendChild(d);
      });
    } else {
      box.textContent = 'Компьютер не подключён к сети (Wi-Fi / LAN).';
    }
  } else {
    box.textContent = 'Адрес появится после перезапуска со встроенным сервером.';
  }
}

async function init() {
  const r = await api.get();
  cfg = r.cfg; info = r.info;
  fill(cfg);
  renderInfo();
}

document.querySelectorAll('#modeSeg .opt').forEach((o) => o.addEventListener('click', () => setMode(o.dataset.v)));

$('testAI').onclick = async () => {
  const btn = $('testAI'), out = $('aiResult');
  btn.disabled = true;
  note(out, 'info', 'Проверяем…');
  try {
    const r = await api.testAI(read());
    note(out, r.ok ? 'ok' : 'bad', r.ok ? r.message : `${REASONS[r.reason] || 'ошибка'}: ${r.message || ''}`);
  } catch (e) { note(out, 'bad', e.message); }
  btn.disabled = false;
};

$('testRemoteAI').onclick = async () => {
  const btn = $('testRemoteAI'), out = $('aiRemoteResult');
  btn.disabled = true;
  note(out, 'info', 'Проверяем… (сайт на бесплатном хостинге может просыпаться до минуты)');
  try {
    const r = await api.portalAI();
    note(out, r.online ? 'ok' : 'warn', r.online
      ? `Помощник работает. Модель: ${r.model}`
      : `Модель на сайте недоступна: ${REASONS[r.reason] || r.reason || 'нет ответа'}. Это настраивается на сервере сайта (LM_STUDIO_URL).`);
  } catch (e) { note(out, 'bad', e.message); }
  btn.disabled = false;
};

$('openData').onclick = () => api.openPath('data');
$('openLog').onclick = () => api.openPath('log');
$('reset').onclick = async () => { fill(await api.defaults()); $('saveMsg').textContent = 'Значения по умолчанию — нажмите «Сохранить».'; };

$('save').onclick = async () => {
  const btn = $('save');
  btn.disabled = true;
  try {
    const r = await api.save(read());
    const fresh = await api.get();
    cfg = fresh.cfg; info = fresh.info;
    fill(cfg);
    renderInfo();
    $('saveMsg').textContent = r.restart ? 'Сохранено. Изменения вступят в силу после перезапуска.' : 'Сохранено.';
  } catch (e) {
    $('saveMsg').textContent = 'Ошибка: ' + e.message;
  }
  btn.disabled = false;
};

init().catch((e) => { $('saveMsg').textContent = 'Ошибка: ' + e.message; });
