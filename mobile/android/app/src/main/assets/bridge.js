/*
 * KU Portal (Android): мост между порталом и системой. Подключается приложением к каждой
 * странице портала/онлайн-экзамена (MainActivity.injectBridge). Повторное подключение безопасно.
 *  - window.Notification → системные уведомления Android (в WebView своего Notification API нет);
 *  - поправки раскладки на узком экране (верхняя панель онлайн-экзамена, плитки сервисов);
 *  - скачивание blob:/data:-ссылок (экспорт данных JSON, CSV ведомости, tests.json) → «Сохранить как»;
 *    Blob читается локально, чтобы не нарушать connect-src CSP при загрузке blob:-URL.
 */
(function () {
  'use strict';
  var B = window.KUApp;
  if (!B || window.__kuBridge) return;
  window.__kuBridge = true;

  /* ---------- Notification ---------- */
  var permWaiters = [];
  window.__kuPermResult = function (r) {
    var list = permWaiters; permWaiters = [];
    list.forEach(function (fn) { try { fn(r); } catch (e) { /* обработчик страницы */ } });
  };

  function KUNotification(title, opts) {
    opts = opts || {};
    this.title = String(title == null ? '' : title);
    this.body = String(opts.body == null ? '' : opts.body);
    this.tag = String(opts.tag == null ? '' : opts.tag);
    this.data = opts.data;
    this.onclick = null; this.onclose = null; this.onerror = null; this.onshow = null;
    B.showNotification(this.title, this.body, this.tag);
    var self = this;
    setTimeout(function () { if (typeof self.onshow === 'function') self.onshow(); }, 0);
  }
  KUNotification.prototype.close = function () { B.cancelNotification(this.tag); };
  KUNotification.prototype.addEventListener = function (type, fn) { if (type === 'click') this.onclick = fn; };
  KUNotification.prototype.removeEventListener = function () {};
  Object.defineProperty(KUNotification, 'permission', { get: function () { return B.notifPermission(); } });
  Object.defineProperty(KUNotification, 'maxActions', { value: 0 });
  KUNotification.requestPermission = function (cb) {
    return new Promise(function (resolve) {
      permWaiters.push(function (r) { if (typeof cb === 'function') cb(r); resolve(r); });
      B.requestNotifPermission();
    });
  };
  try {
    Object.defineProperty(window, 'Notification', { value: KUNotification, writable: true, configurable: true });
  } catch (e) { window.Notification = KUNotification; }

  /* ---------- раскладка на узких экранах телефонов (копия desktop/ui/app-fix.css) ---------- */
  var APP_FIX_CSS = "/* KU Portal (приложения): поправки раскладки для узких экранов телефонов.\n   Сайт не меняется — стиль добавляет приложение поверх страниц портала и онлайн-экзамена. */\n\n/* Онлайн-экзамен: верхняя панель на узком экране — без разделителей и подписи логотипа\n   (значок логотипа остаётся — он ведёт на главную), шестерёнка внутри кнопки профиля скрыта\n   (аватар открывает те же настройки), кнопки чуть компактнее. */\n@media (max-width: 480px) {\n  .tb-in { gap: 4px !important; padding: 0 8px !important; }\n  .tb-in .tb-sep { display: none !important; }\n  .tb-in .brand-t { display: none !important; }\n  .tb-in .me-gear { display: none !important; }\n  .tb-in .tb-ib { width: 36px !important; height: 36px !important; }\n  .tb-in .lang button { min-width: 30px !important; height: 30px !important; padding: 0 5px !important; font-size: 12px !important; }\n  .tb-in .avatar { width: 34px !important; height: 34px !important; font-size: 14px !important; }\n  .tb-in .ku-back { padding: 0 6px !important; }\n}\n\n/* Портал, главная → «Сервисы»: на экранах ~320 px длинные подписи («Успеваемость»)\n   растягивали плитки шире экрана. */\n@media (max-width: 360px) {\n  .srv-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 8px !important; margin-left: 10px !important; margin-right: 10px !important; }\n  .srv { padding-left: 4px !important; padding-right: 4px !important; min-width: 0 !important; }\n  .srv span { font-size: 10px !important; letter-spacing: -0.1px; overflow-wrap: anywhere; }\n}\n";
  function appFix() {
    if (document.getElementById('ku-app-fix')) return;
    var st = document.createElement('style');
    st.id = 'ku-app-fix';
    st.textContent = APP_FIX_CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  appFix();
  document.addEventListener('DOMContentLoaded', appFix);

  /* ---------- сохранение файлов ---------- */
  var blobFiles = new Map();
  var makeBlobUrl = URL.createObjectURL.bind(URL);
  var revokeBlobUrl = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = function (value) {
    var href = makeBlobUrl(value);
    if (value instanceof Blob) blobFiles.set(href, value);
    return href;
  };
  URL.revokeObjectURL = function (href) {
    blobFiles.delete(href);
    return revokeBlobUrl(href);
  };

  function sendFile(blob, name) {
    if (!(blob instanceof Blob)) { B.toast('Не удалось сохранить файл'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var s = String(fr.result), i = s.indexOf(',');
      B.saveFile(name || 'ku-portal-file', blob.type || 'application/octet-stream', s.slice(i + 1));
    };
    fr.onerror = function () { B.toast('Не удалось сохранить файл'); };
    fr.readAsDataURL(blob);
  }
  function saveHref(href, name) {
    var localBlob = blobFiles.get(href);
    if (localBlob) { sendFile(localBlob, name); return; }
    if (/^data:/i.test(href)) {
      try {
        var comma = href.indexOf(','), meta = href.slice(5, comma), body = href.slice(comma + 1);
        var bytes;
        if (/;base64/i.test(meta)) {
          var raw = atob(body); bytes = new Uint8Array(raw.length);
          for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        } else {
          bytes = new TextEncoder().encode(decodeURIComponent(body));
        }
        sendFile(new Blob([bytes], { type: meta.split(';')[0] || 'application/octet-stream' }), name);
      } catch (e) { B.toast('Не удалось сохранить файл'); }
      return;
    }
    fetch(href).then(function (r) { if (!r.ok) throw new Error('download failed'); return r.blob(); }).then(function (blob) {
      sendFile(blob, name);
    }).catch(function () { B.toast('Не удалось сохранить файл'); });
  }
  function isFileLink(a) {
    return a && a.hasAttribute && a.hasAttribute('download') && /^(blob|data):/i.test(a.href || '');
  }
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (isFileLink(this)) { saveHref(this.href, this.getAttribute('download')); return; }
    return origClick.apply(this, arguments);
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
    if (isFileLink(a)) { e.preventDefault(); saveHref(a.href, a.getAttribute('download')); }
  }, true);
})();
