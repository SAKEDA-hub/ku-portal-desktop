// Экран ожидания: показываем, пока сайт отвечает на первый запрос.
var q = new URLSearchParams(location.search);
var url = q.get('url') || '';
document.getElementById('url').textContent = url;
var msg = document.getElementById('msg');
setTimeout(function () { msg.textContent = 'Ожидаем ответ сайта…'; }, 6000);
setTimeout(function () { msg.textContent = 'Ещё немного… Если ожидание затянулось, проверьте интернет или адрес сервера.'; }, 45000);
// replace — чтобы «Назад» из портала не возвращал на этот экран
if (/^https?:\/\//i.test(url)) setTimeout(function () { location.replace(url.replace(/\/+$/, '') + '/'); }, 50);
