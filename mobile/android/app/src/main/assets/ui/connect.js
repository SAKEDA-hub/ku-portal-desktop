/* Экран «Подключение»: выбор сервера портала. API приложения — window.KUApp (WebBridge.java) */
(function () {
  'use strict';
  var A = window.KUApp;
  var $ = function (id) { return document.getElementById(id); };
  var DEFAULT = (A && A.defaultServer()) || 'https://ku-portal.onrender.com';
  var current = (A && A.getServer()) || '';
  var busy = false;

  var REASONS = {
    unreachable: 'сервер портала не видит LM Studio',
    timeout: 'LM Studio не отвечает',
    auth: 'неверный ключ LM Studio',
    no_model: 'в LM Studio не загружена модель',
    bad_response: 'по адресу LM Studio отвечает другой сервис'
  };

  function note(el, kind, text) { el.className = 'note ' + kind; el.textContent = text; }

  function setKind(v) {
    document.querySelectorAll('#kinds .opt').forEach(function (o) {
      var on = o.getAttribute('data-v') === v;
      o.classList.toggle('on', on);
      o.querySelector('input').checked = on;
    });
    $('pcBox').classList.toggle('hide', v !== 'pc');
    $('customBox').classList.toggle('hide', v !== 'custom');
  }
  function kind() {
    var c = document.querySelector('input[name=kind]:checked');
    return c ? c.value : 'site';
  }

  function isIp(host) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === 'localhost'; }

  /* «192.168.1.10» → http://192.168.1.10:3000; «example.org» → https://example.org */
  function normalize(raw, forPc) {
    var s = String(raw || '').trim();
    if (!s) return null;
    if (!/^[a-z]+:\/\//i.test(s)) {
      var host = s.split(/[/:]/)[0];
      s = (forPc || isIp(host) ? 'http://' : 'https://') + s;
    }
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol) || !u.hostname) return null;
    if (forPc && !u.port && u.protocol === 'http:') u.port = '3000';
    return u.origin;
  }

  function target() {
    var k = kind();
    if (k === 'site') return DEFAULT;
    if (k === 'pc') return normalize($('pcAddr').value, true);
    return normalize($('customAddr').value, false);
  }

  window.__kuTestResult = function (r) {
    busy = false;
    $('go').disabled = false;
    var st = $('status');
    if (!r || !r.ok) {
      var hint = kind() === 'pc'
        ? '\nПроверьте: программа KU Portal Desktop запущена, «Доступ с телефона» включён, телефон в той же Wi-Fi сети, брандмауэр не блокирует порт.'
        : '\nПроверьте интернет и адрес.';
      note(st, 'bad', 'Не удалось подключиться: ' + ((r && r.message) || 'нет ответа') + hint);
      return;
    }
    var ai = r.aiOnline
      ? 'AI-помощник работает (модель ' + r.model + ').'
      : 'Портал доступен. AI-помощник сейчас недоступен' + (r.reason && REASONS[r.reason] ? ' — ' + REASONS[r.reason] : '') + '; остальное работает.';
    note(st, r.aiOnline ? 'ok' : 'warn', 'Подключено. ' + ai);
    setTimeout(function () { A.connect(pending); }, r.aiOnline ? 600 : 1800);
  };

  var pending = null;
  $('go').onclick = function () {
    if (busy) return;
    var url = target();
    var st = $('status');
    if (!url) { note(st, 'bad', 'Введите адрес, например 192.168.1.10:3000'); return; }
    if (!A) { note(st, 'info', 'Предпросмотр: ' + url); return; }
    busy = true; pending = url;
    $('go').disabled = true;
    note(st, 'info', 'Проверяем ' + url + '…' + (kind() === 'site' ? '\nСервер может просыпаться до минуты.' : ''));
    A.testServer(url);
  };

  document.querySelectorAll('#kinds .opt').forEach(function (o) {
    o.addEventListener('click', function () { setKind(o.getAttribute('data-v')); });
  });

  // начальное состояние
  $('siteHint').textContent = DEFAULT.replace(/^https?:\/\//, '') + ' — аккаунты и данные как на сайте. Нужен интернет.';
  var q = new URLSearchParams(location.search);
  if (q.get('error')) { $('error').classList.remove('hide'); $('error').textContent = q.get('error'); }
  if (current) {
    $('currentCard').classList.remove('hide');
    $('current').textContent = current;
    $('back').onclick = function () { A.connect(current); };
    if (current === DEFAULT) setKind('site');
    else if (/^http:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(current)) { setKind('pc'); $('pcAddr').value = current.replace(/^http:\/\//, ''); }
    else { setKind('custom'); $('customAddr').value = current; }
  } else {
    setKind('site');
  }
  if (A) $('ver').textContent = 'Версия ' + A.version();
})();
