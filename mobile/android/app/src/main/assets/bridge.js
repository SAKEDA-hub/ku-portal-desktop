/*
 * KU Portal (Android): мост между порталом и системой. Подключается приложением к каждой
 * странице портала/онлайн-экзамена (MainActivity.injectBridge). Повторное подключение безопасно.
 *  - window.Notification → системные уведомления Android (в WebView своего Notification API нет);
 *  - скачивание blob:/data:-ссылок (экспорт данных JSON, CSV ведомости, tests.json) → «Сохранить как».
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

  /* ---------- сохранение файлов ---------- */
  function saveHref(href, name) {
    fetch(href).then(function (r) { return r.blob(); }).then(function (blob) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result), i = s.indexOf(',');
        B.saveFile(name || 'ku-portal-file', blob.type || 'application/octet-stream', s.slice(i + 1));
      };
      fr.onerror = function () { B.toast('Не удалось сохранить файл'); };
      fr.readAsDataURL(blob);
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
