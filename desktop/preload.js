/* Главное окно: портал не получает доступа к Node.js. Наружу — только признак
   десктопа и две команды для экранов ожидания/ошибки. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kuDesktop', {
  isDesktop: true,
  platform: process.platform,
  openSettings: () => ipcRenderer.send('app:openSettings'),
  retry: () => ipcRenderer.send('app:retry'),
});
