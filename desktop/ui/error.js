const q = new URLSearchParams(location.search);
document.getElementById('title').textContent = q.get('title') || 'Не удалось открыть портал';
const details = q.get('details') || '';
const pre = document.getElementById('details');
if (details) pre.textContent = details; else pre.classList.add('hide');
document.getElementById('hint').textContent = q.get('mode') === 'remote'
  ? 'Проверьте подключение к интернету и адрес сайта в настройках. Можно переключиться на встроенный сервер — он работает без интернета.'
  : 'Встроенный сервер не ответил. Попробуйте ещё раз или смените порт в настройках. Подробности — в журнале сервера (Файл → Открыть журнал сервера).';
const api = window.kuDesktop;
document.getElementById('retry').onclick = () => api && api.retry();
document.getElementById('settings').onclick = () => api && api.openSettings();
