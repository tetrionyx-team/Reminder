const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pixelFriend', {
  getState: () => ipcRenderer.invoke('get-state'),
  save: value => ipcRenderer.invoke('save-settings', value),
  action: (value, payload) => ipcRenderer.send('action', value, payload),
  loadAsset: relPath => ipcRenderer.invoke('load-asset', relPath),
  createShortcut: () => ipcRenderer.invoke('create-desktop-shortcut'),
  getAutoStart: () => ipcRenderer.invoke('get-autostart'),
  setAutoStart: val => ipcRenderer.invoke('set-autostart', val),
  onState: callback => ipcRenderer.on('state', (_, value) => callback(value)),
  onReminder: callback => ipcRenderer.on('reminder', (_, value) => callback(value))
});
