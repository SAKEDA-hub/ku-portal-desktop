/* Главное окно: портал не получает доступа к Node.js. Наружу — только признак
   десктопа, две команды для экранов ожидания/ошибки и сигнал «обратить внимание» (вызов на speaking). */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kuDesktop', {
  isDesktop: true,
  platform: process.platform,
  openSettings: () => ipcRenderer.send('app:openSettings'),
  retry: () => ipcRenderer.send('app:retry'),
  // онлайн-экзамен: студента вызвали на speaking — мигнуть значком в панели задач, если окно не в фокусе
  attention: () => ipcRenderer.send('app:attention'),
});
