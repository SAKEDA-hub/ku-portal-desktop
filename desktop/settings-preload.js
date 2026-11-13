/* Окно «Настройки приложения» (локальный файл ui/settings.html) */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kuSettings', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (cfg) => ipcRenderer.invoke('settings:save', cfg),
  defaults: () => ipcRenderer.invoke('settings:defaults'),
  testAI: (cfg) => ipcRenderer.invoke('settings:testAI', cfg),
  portalAI: () => ipcRenderer.invoke('settings:portalAI'),
  openPath: (which) => ipcRenderer.invoke('settings:openPath', which),
});
