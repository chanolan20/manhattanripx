'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, safe API to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),
  getUserDataPath: () => ipcRenderer.invoke('app:userDataPath'),

  // File dialogs
  openFileDialog: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Is running inside Electron
  isElectron: true,
});
