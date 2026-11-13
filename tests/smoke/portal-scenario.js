/* Общий сценарий проверки портала внутри готовой программы (ПК или Android).
   Использует настоящий код портала: loginWith(), маршруты, кнопку «Перейти к онлайн-экзамену»,
   кнопку «KU Portal» в онлайн-экзамене. */
'use strict';
const { sleep } = require('./cdp');

async function run(c, base, { shot = async () => {}, log = console.log, notifExpect = 'granted' } = {}) {
  const origin = new URL(base).origin;
  const res = {};
  await c.waitFor(`location.origin === ${JSON.stringify(origin)} && !!document.querySelector('#app') && document.querySelector('#app').children.length > 0`, 120000, 'портал открылся');
  await shot('01-open');

  // вход тестовым студентом (функция портала loginWith)
  await c.evaluate(`(async () => { localStorage.removeItem('ku_token'); await loginWith('student@demo.kz', '1234'); return true; })()`);
  await c.waitFor(`!!localStorage.getItem('ku_token') && document.body.innerText.includes('Иванов')`, 30000, 'вход и главная');
  res.login = true;
  await sleep(800);
  await shot('02-home');

  // записи: оценки и расписание с сервера
  res.grades = await c.evaluate(`fetch('/api/grades', { headers: { Authorization: 'Bearer ' + localStorage.getItem('ku_token') } }).then(r => r.status)`);
  res.schedule = await c.evaluate(`fetch('/api/schedule', { headers: { Authorization: 'Bearer ' + localStorage.getItem('ku_token') } }).then(r => r.status)`);

  // AI-помощник: статус и ответ
  res.ai = await c.evaluate(`fetch('/api/ai/status').then(r => r.json())`);
  const chat = await c.evaluate(`fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('ku_token') }, body: JSON.stringify({ message: 'Есть ли общежитие в университете?' }) }).then(r => r.json())`);
  res.aiReply = !!(chat && chat.reply);
  await c.evaluate(`location.hash = '#/ai'`);
  await c.waitFor(`document.body.innerText.includes('AI')`, 15000, 'экран AI-помощника');
  await sleep(600);
  await shot('03-ai');

  // кабинет и настройки
  await c.evaluate(`location.hash = '#/profile'`);
  await c.waitFor(`document.body.innerText.includes('Оформление')`, 15000, 'кабинет с настройками');
  res.notification = await c.evaluate(`'Notification' in window ? Notification.permission : 'нет'`);
  await sleep(500);
  await shot('04-profile');

  // переход в онлайн-экзамен и обратно
  await c.evaluate(`location.hash = '#/exam'`);
  await c.waitFor(`!!document.getElementById('oeGo')`, 15000, 'кнопка «Перейти к онлайн-экзамену»');
  await sleep(500);
  await shot('05-exam');
  await c.evaluate(`document.getElementById('oeGo').click(), true`);
  await c.waitFor(`location.pathname.startsWith('/exam-sync/') && document.readyState === 'complete'`, 30000, 'открылся онлайн-экзамен');
  await sleep(1500);
  await shot('06-online-exam');
  res.exam = true;
  const back = await c.waitFor(`(() => { const el = [...document.querySelectorAll('a,button')].find(e => e.offsetParent && /KU Portal/.test(e.textContent)); return el ? (el.click(), true) : false; })()`, 15000, 'кнопка «KU Portal» в онлайн-экзамене');
  res.examBack = !!back;
  await c.waitFor(`location.pathname === '/' && location.hash.startsWith('#/exam')`, 20000, 'возврат в портал');
  await sleep(800);
  await shot('07-back');

  res.notifOk = notifExpect == null || res.notification === notifExpect;
  log('результат: ' + JSON.stringify(res));
  const problems = [];
  if (res.grades !== 200) problems.push('оценки HTTP ' + res.grades);
  if (res.schedule !== 200) problems.push('расписание HTTP ' + res.schedule);
  if (!res.aiReply) problems.push('AI не ответил');
  if (!res.notifOk) problems.push('уведомления: ' + res.notification + ' (ожидалось ' + notifExpect + ')');
  if (problems.length) throw new Error(problems.join('; '));
  return res;
}

module.exports = { run };
