/* Минимальный клиент Chrome DevTools Protocol (Node 22+: глобальный WebSocket, fetch).
   Используется автопроверками готовых программ (Electron и Android WebView). */
'use strict';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets(base) {
  const r = await fetch(base + '/json/list', { signal: AbortSignal.timeout(3000) });
  return r.json();
}

async function waitTarget(base, pred, ms = 60000) {
  const until = Date.now() + ms;
  let last = [];
  while (Date.now() < until) {
    try {
      last = await targets(base);
      const t = last.find((x) => x.type === 'page' && pred(x));
      if (t) return t;
    } catch { /* ещё не запустилось */ }
    await sleep(500);
  }
  throw new Error('нет нужной страницы; есть: ' + last.map((x) => x.url).join(', '));
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) rej(new Error(m.error.message)); else res(m.result);
      }
    };
    ws.onerror = () => reject(new Error('CDP: нет соединения ' + wsUrl));
    ws.onopen = () => {
      const send = (method, params = {}) => new Promise((res, rej) => {
        const i = ++id;
        pending.set(i, { res, rej });
        ws.send(JSON.stringify({ id: i, method, params }));
        setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('CDP timeout: ' + method)); } }, 30000);
      });
      async function evaluate(expr) {
        const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
        return r.result.value;
      }
      async function waitFor(expr, ms = 20000, what = expr) {
        const until = Date.now() + ms;
        let last;
        while (Date.now() < until) {
          try { last = await evaluate(expr); if (last) return last; } catch (e) { last = e.message; }
          await sleep(300);
        }
        throw new Error('не дождались: ' + what + ' (последнее: ' + JSON.stringify(last) + ')');
      }
      async function screenshot(file) {
        const r = await send('Page.captureScreenshot', { format: 'png' });
        require('fs').writeFileSync(file, Buffer.from(r.data, 'base64'));
      }
      resolve({ send, evaluate, waitFor, screenshot, close: () => ws.close() });
    };
  });
}

module.exports = { sleep, targets, waitTarget, connect };
