// Экран ожидания для режима «Сайт».
const q = new URLSearchParams(location.search);
document.getElementById('url').textContent = q.get('url') || '';
const msg = document.getElementById('msg');
setTimeout(() => { msg.textContent = 'Ожидаем ответ сайта…'; }, 6000);
setTimeout(() => { msg.textContent = 'Ещё немного… Если ожидание затянулось, проверьте интернет.'; }, 45000);
