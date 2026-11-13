// Экран ожидания для режима «Сайт»: бесплатный Render просыпается до минуты
const q = new URLSearchParams(location.search);
document.getElementById('url').textContent = q.get('url') || '';
const msg = document.getElementById('msg');
setTimeout(() => { msg.textContent = 'Сервер просыпается — на бесплатном хостинге это занимает до минуты…'; }, 6000);
setTimeout(() => { msg.textContent = 'Ещё немного… Если ожидание затянулось, проверьте интернет.'; }, 45000);
